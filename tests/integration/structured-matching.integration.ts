import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Phase 5.3 Stage F4: structured matching end to end against the local test database (fictional data only), in every flag
// state: what is stored, what is shown, rollback against stored findings, freshness, and the answer lifecycle.
import { currentFindings, getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { confirmWithDetail, correctStructuredAnswer, deleteAnswerPermanently, revokeAnswer, saveStructuredAnswer } from "@/lib/ai/clarification-review";
import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const flags = (extra: Record<string, string>) => readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", ...extra });
const plain = flags({});
const reviewOnly = flags({ CLARIFICATION_REVIEW_ENABLED: "true" });
const form = flags({ CLARIFICATION_REVIEW_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true" });
const matching = flags({ CLARIFICATION_REVIEW_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", STRUCTURED_MATCHING_ENABLED: "true" });
const matchingNoForm = flags({ CLARIFICATION_REVIEW_ENABLED: "true", STRUCTURED_MATCHING_ENABLED: "true" });
const OFF = [plain, reviewOnly, form, matchingNoForm];
const PLUMBING = "Install and repair residential plumbing"; // an approved split (A58)
const SALESFORCE = "Salesforce";
const STRONG = "I install water heaters and repair leaking pipes in homes myself every day.";

async function account(requirements: string[], skills: string[] = []) {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Clinic Assistant", company: "Invented Clinic", startMonth: "2020-01", endMonth: null, description: "Answered phones." } });
  for (const name of skills) await prisma.technicalSkill.create({ data: { profileId: user.careerProfile!.id, name, normalizedName: name.toLowerCase() } });
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({ data: { userId: user.id, title: "Technician", company: `Invented ${randomUUID().slice(0, 6)}`, description, reviewedDescription: description, reviewVersion: 1, requirements: requirements.map(text => ({ priority: "Required", category: "Skills", text, source: "Fictional listing." })) } as never });
  const run = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config: form });
  if (!run.ok) throw new Error(run.error);
  return { id, user, role, job, analysisId: run.analysisId };
}
type Account = Awaited<ReturnType<typeof account>>;
const key = (text: string) => questionKey(text, "work_detail");
const latest = (a: Account) => prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId: a.user.id, savedJobId: a.job.id }, orderBy: { createdAt: "desc" } });
const rerun = async (a: Account, config: AiConfig) => { const r = await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config, recheck: true }); if (!r.ok) throw new Error(r.error); return r.analysisId; };
const stored = async (a: Account) => { const x = await latest(a); return { findings: x.findings as Finding[], verdictCounts: x.verdictCounts as Record<string, number>, recognitionVersion: x.recognitionVersion, methodVersion: x.methodVersion }; };
const page = async (a: Account, config: AiConfig) => (await getAnalysisPageData(a.id, a.job.id, config))!;
const save = (a: Account, text: string, submission: Record<string, unknown>) => saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(text), config: form, submission: submission as never });
const performed = (a: Account, extra: Record<string, unknown> = {}) => ({ involvement: "PERFORMED", frequency: "MOST_DAYS", recency: "CURRENT", experienceId: a.role.id, ...extra });
const counted = (findings: { verdict: string }[]) => findings.reduce<Record<string, number>>((m, f) => ({ ...m, [f.verdict]: (m[f.verdict] ?? 0) + 1 }), {});
const MASKED = { verdict: "insufficient_information", citations: [], explanation: expect.stringMatching(/structured answer, which isn't used for matching/) };

beforeAll(() => {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  expect(new URL(process.env.DATABASE_URL!).hostname).toBe("127.0.0.1");
  verifiedDatabase = true;
});
beforeEach(() => { identities = []; });
afterEach(async () => {
  if (!verifiedDatabase) return;
  await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
});
afterAll(async () => { await prisma.$disconnect(); });

// ---------------------------------------------------------------------------------------------------------------------
describe("flag off: nothing changes, and saving a structured answer doesn't make the analysis stale (F-10)", () => {
  it.each(OFF.map((c, i) => [i, c] as const))("config %i: verdicts identical, nothing structured stored, still fresh", async (_i, config) => {
    const a = await account([PLUMBING, SALESFORCE]);
    await rerun(a, config);
    const before = await stored(a);
    expect(await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }))).toEqual({ ok: true });
    expect(await save(a, SALESFORCE, { involvement: "NOT_DONE" })).toEqual({ ok: true });
    if (config.enabled && config.reviewEnabled) expect((await page(a, config)).latest!.outOfDate.profile).toBe(false);
    await rerun(a, config);
    const after = await stored(a);
    expect(after).toEqual(before);
    expect(after.recognitionVersion).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("flag on: structured answers count, through the rule table and the validator", () => {
  it("a description showing every ticked part: Supported, citing the person's words; the recognition version is recorded", async () => {
    const a = await account([PLUMBING]);
    expect(await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }))).toEqual({ ok: true });
    // F-10: with structured matching on, a new structured answer makes the analysis out of date.
    expect((await page(a, matching)).latest!.outOfDate.profile).toBe(true);
    await rerun(a, matching);
    const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    const s = await stored(a);
    expect(s.findings[0]).toMatchObject({ verdict: "supported", basis: "candidate_answer", rulesOnlyVerdict: "insufficient_information", evidenceSources: ["candidate_answer"], citations: [{ evidenceId: `experience:${row.id}` }] });
    expect(STRONG).toContain(s.findings[0].citations[0].quote);
    expect(s.recognitionVersion).toBe("splits-v1.1");
    expect(s.methodVersion).toBe("rules-v21");
    expect(s.verdictCounts).toMatchObject(counted(s.findings));
    const shown = await page(a, matching);
    expect(shown.latest!.outOfDate.profile).toBe(false);
    expect(shown.latest!.findings[0]).toMatchObject({ verdict: "supported" });
  });
  it("one part only: Possible, citing the words", async () => {
    const a = await account([PLUMBING]);
    await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0"] }));
    await rerun(a, matching);
    expect((await stored(a)).findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_answer" });
  });
  it("a choice alone (no description): Possible, citing the choice in CareerOS's wording; masked with the flag off (F5)", async () => {
    const a = await account([SALESFORCE]);
    await save(a, SALESFORCE, { involvement: "PERFORMED", frequency: "MOST_DAYS", recency: "CURRENT", experienceId: a.role.id });
    await rerun(a, matching);
    const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    const s = await stored(a);
    expect(s.findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_choice", evidenceSources: ["candidate_choice"], citations: [{ evidenceId: `choice:${row.id}`, quote: expect.stringMatching(/^Structured answer, self-reported: CareerOS hasn't independently verified it\. Choice: I did this work myself/) }] });
    expect(s.verdictCounts).toMatchObject({ possible: 1 });
    const on = await page(a, matching);
    expect(on.latest!.findings[0]).toMatchObject({ verdict: "possible", basis: "candidate_choice" });
    expect(on.latest!.verdictCounts).toMatchObject({ possible: 1 });
    for (const config of OFF) {
      const off = await page(a, config);
      expect(off.latest!.findings[0]).toMatchObject(MASKED);
      expect(off.latest!.verdictCounts).toMatchObject({ possible: 0, insufficient_information: 1 });
      expect(off.history[0].analysis!.verdictCounts).toMatchObject({ possible: 0, insufficient_information: 1 });
    }
  });
  it("an irrelevant description never gives Supported, and its words are never cited (only the choice is)", async () => {
    const a = await account([PLUMBING]);
    await save(a, PLUMBING, performed(a, { detail: "I pick up parts for the plumbers who install water heaters.", parts: ["0", "1"] }));
    await rerun(a, matching);
    const f = (await stored(a)).findings[0];
    expect(f.verdict).not.toBe("supported");
    expect(f.citations.every(c => c.evidenceId.startsWith("choice:"))).toBe(true);
    expect(JSON.stringify(f)).not.toContain("pick up parts");
  });
  it("a lead choice on a split, and a grouped question, stay Not enough information", async () => {
    const a = await account([PLUMBING]);
    await save(a, PLUMBING, { involvement: "ASSISTED", alsoDidSome: "no", experienceId: a.role.id, detail: STRONG });
    await rerun(a, matching);
    expect((await stored(a)).findings[0].verdict).toBe("insufficient_information");
  });
  it("'haven't done this' is a denial; a rules Supported (a listed skill) is never lowered", async () => {
    const a = await account([PLUMBING, SALESFORCE], [SALESFORCE]);
    expect((await stored(a)).findings[1].verdict).toBe("supported");
    await save(a, PLUMBING, { involvement: "NOT_DONE" });
    await prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: SALESFORCE, outcome: "DENIED", formVersion: 2, involvement: "NOT_DONE", questionKey: key(SALESFORCE), coveredKeys: [key(SALESFORCE)] } });
    await rerun(a, matching);
    const s = await stored(a);
    expect(s.findings[0]).toMatchObject({ verdict: "gap", basis: "candidate_denied" });
    expect(s.findings[1]).toMatchObject({ verdict: "supported" });
    expect((await page(a, matching)).latest!.findings[0]).toMatchObject({ verdict: "gap" });
  });
  it("a free-text answer wins over a structured one to the same question", async () => {
    const a = await account([SALESFORCE]);
    expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(SALESFORCE), experienceId: a.role.id, detail: "I used Salesforce once in a training video.", config: form })).toMatchObject({ ok: true });
    const freeOnly = await stored(a);
    // Impossible through the app (E2); written directly to show precedence.
    const r = await prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: SALESFORCE, outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, formVersion: 2, involvement: "PERFORMED", frequency: "MOST_DAYS", recency: "CURRENT", detail: "I administer Salesforce for 80 users every day.", questionKey: key(SALESFORCE), coveredKeys: [key(SALESFORCE)] } });
    await prisma.candidateClarification.update({ where: { id: r.id }, data: { evidenceId: `experience:${r.id}` } });
    await rerun(a, matching);
    const s = await stored(a);
    expect(s.findings[0].verdict).toBe(freeOnly.findings[0].verdict);
    expect(JSON.stringify(s.findings)).not.toContain(r.id);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("rollback (F-9): stored structured findings stop counting the moment the flag is off", () => {
  it("shown, counted, asked and in the run history: masked with every flag-off state; reanalysis restores flag-off results", async () => {
    const a = await account([PLUMBING, SALESFORCE]);
    const flagOff = await stored(a);
    await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }));
    await save(a, SALESFORCE, { involvement: "NOT_DONE" });
    const analysisId = await rerun(a, matching);
    const on = await stored(a);
    expect(on.findings.map(f => f.verdict)).toEqual(["supported", "gap"]);
    // A question whose result rests on a structured answer isn't asked while matching is on…
    expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId, questionKey: key(PLUMBING), experienceId: a.role.id, detail: "I fix pipes.", config: matching })).toMatchObject({ ok: false, error: "not_askable" });

    for (const config of OFF) {
      const p = await page(a, config);
      expect(p.latest!.findings[0], "supported, masked").toMatchObject(MASKED);
      expect(p.latest!.findings[1], "denial, masked").toMatchObject({ verdict: "insufficient_information" });
      expect(p.latest!.verdictCounts).toEqual({ supported: 0, possible: 0, gap: 0, insufficient_information: 2 });
      const run = p.history.find(h => h.analysis && h.id === p.history[0].id)!;
      expect(run.analysis!.verdictCounts, "history counts").toEqual({ supported: 0, possible: 0, gap: 0, insufficient_information: 2 });
      expect((await currentFindings(a.user.id, (await latest(a)).requirements as never, on.findings, config)).map(f => f.verdict)).toEqual(["insufficient_information", "insufficient_information"]);
    }
    // …and is asked again once it's off.
    expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId, questionKey: key(PLUMBING), experienceId: a.role.id, detail: "I fix leaking pipes in homes myself.", config: reviewOnly })).toMatchObject({ ok: true });
    // With matching back on, the stored result shows again (the free-text answer now wins on reanalysis).
    const b = await account([PLUMBING]);
    await save(b, PLUMBING, performed(b, { detail: STRONG, parts: ["0", "1"] }));
    await rerun(b, matching);
    expect((await page(b, matching)).latest!.findings[0]).toMatchObject({ verdict: "supported" });
    expect((await page(b, form)).latest!.findings[0]).toMatchObject(MASKED);
    await rerun(b, form);
    expect((await stored(b)).findings[0]).toMatchObject({ verdict: flagOff.findings[0].verdict, basis: flagOff.findings[0].basis });
    expect((await page(b, form)).latest!.findings[0]).toMatchObject({ verdict: flagOff.findings[0].verdict });
  });
  it("an analysis stored before structured matching shows the same under every flag state", async () => {
    const a = await account([PLUMBING, SALESFORCE], [SALESFORCE]);
    const views = await Promise.all([plain, reviewOnly, form, matching].map(c => page(a, c)));
    for (const v of views) expect(v.latest!.findings.map(f => [f.verdict, f.basis])).toEqual(views[0].latest!.findings.map(f => [f.verdict, f.basis]));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe("lifecycle with matching on: correction, revocation and deletion", () => {
  it("correction: the new version is read on reanalysis; a stored result of the old one is masked as revoked", async () => {
    const a = await account([PLUMBING]);
    await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }));
    await rerun(a, matching);
    const first = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    const older = await latest(a);
    expect(await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: first.id, config: form, submission: performed(a, { detail: STRONG, parts: ["0"] }) as never })).toEqual({ ok: true });
    // The older analysis is still the newest until reanalysis; its result rests on the corrected version.
    expect((await latest(a)).id).toBe(older.id);
    expect((await page(a, matching)).latest!.findings[0]).toMatchObject({ verdict: "insufficient_information", explanation: expect.stringMatching(/revoked/) });
    expect((await page(a, matching)).latest!.outOfDate.profile).toBe(true);
    await rerun(a, matching);
    const second = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    expect((await stored(a)).findings[0]).toMatchObject({ verdict: "possible", citations: [{ evidenceId: `experience:${second.id}` }] });
  });
  it("revocation: masked at once; reanalysis gives the rules' own result", async () => {
    const a = await account([PLUMBING]);
    await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }));
    await rerun(a, matching);
    const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    expect(await revokeAnswer({ supabaseAuthId: a.id, clarificationId: row.id, config: matching })).toMatchObject({ ok: true });
    await rerun(a, matching);
    expect((await stored(a)).findings[0]).toMatchObject({ verdict: "insufficient_information", basis: "no_evidence" });
  });
  it("permanent deletion: every stored result of every version is scrubbed", async () => {
    const a = await account([PLUMBING]);
    await save(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }));
    await rerun(a, matching);
    const first = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: first.id, config: form, submission: performed(a, { detail: STRONG, parts: ["0"] }) as never });
    await rerun(a, matching);
    const second = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
    expect(await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: second.id, config: matching })).toBe(true);
    for (const x of await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } })) {
      const findings = x.findings as Finding[];
      const ids = findings.flatMap(f => f.citations.map(c => c.evidenceId));
      expect(ids.filter(id => id.includes(first.id) || id.includes(second.id))).toEqual([]);
      expect(x.verdictCounts).toMatchObject(counted(findings));
    }
  });
});
