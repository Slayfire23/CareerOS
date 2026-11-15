import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Phase 5.3 Stage F3: the lifecycle of a `candidate_choice` citation (`choice:<answer id>`), against the local test
// database (fictional data only). Nothing in the app produces one yet (F4), so a stored finding citing a choice is
// written straight into an analysis, as F4 would store it. It must stay while its answer counts, and stop counting the
// moment the answer is corrected, replaced, revoked or deleted. Corrections and revocations run the analysis again, so
// each test writes the stale citation into the newest analysis after the change: masking, not the rerun, must catch it.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { buildChoiceEvidence, choiceCitation } from "@/lib/ai/choice-evidence";
import { confirmWithDetail, correctAnswer, correctStructuredAnswer, deleteAnswerPermanently, revokeAnswer, saveStructuredAnswer } from "@/lib/ai/clarification-review";
import { readAiConfig } from "@/lib/ai/config";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const on = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true" });
const reviewOnly = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true" });
const plain = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200" });
// Stage F4 (F-9): a stored citation of a structured answer counts only with structured matching on; off, it is masked
// even while the answer is active. So the positive controls below use `matching`.
const matching = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", STRUCTURED_MATCHING_ENABLED: "true" });
const OFF = [on, reviewOnly, plain];
const CONFIGS = [matching, ...OFF];
const PLUMBING = "Install and repair residential plumbing";
const EXCEL = "Microsoft Excel";

async function account(requirements: string[]) {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Clinic Assistant", company: "Invented Clinic", startMonth: "2020-01", endMonth: null, description: "Answered phones." } });
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({ data: { userId: user.id, title: "Technician", company: `Invented ${randomUUID().slice(0, 6)}`, description, reviewedDescription: description, reviewVersion: 1, requirements: requirements.map(text => ({ priority: "Required", category: "Skills", text, source: "Fictional listing." })) } as never });
  const run = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config: on });
  if (!run.ok) throw new Error(run.error);
  return { id, user, role, job, analysisId: run.analysisId };
}
type Account = Awaited<ReturnType<typeof account>>;
const key = (text: string) => questionKey(text, "work_detail");
const latest = (a: Account) => prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId: a.user.id, savedJobId: a.job.id }, orderBy: { createdAt: "desc" } });
const active = (a: Account) => prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
const performed = (a: Account, parts: string[] = []) => ({ involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT", experienceId: a.role.id, parts });
/** A stored `candidate_choice` finding for requirement `index`, citing this answer's choice, as F4 would store it. */
async function storeChoiceFinding(a: Account, answerId: string, index = 0) {
  const row = await prisma.candidateClarification.findUniqueOrThrow({ where: { id: answerId } });
  const choice = buildChoiceEvidence(row)!;
  const citation = choiceCitation(choice);
  const x = await latest(a);
  const findings = (x.findings as Finding[]).map(f => (f.requirementIndex === index ? { ...f, verdict: "possible", basis: "candidate_choice", citations: [{ evidenceId: citation.evidence_id, quote: citation.quote }], evidenceSources: ["candidate_choice"], rulesOnlyVerdict: f.verdict } : f));
  await prisma.jobMatchAnalysis.update({ where: { id: x.id }, data: { findings: JSON.parse(JSON.stringify(findings)) } });
  return choice;
}
const shown = async (a: Account, config: ReturnType<typeof readAiConfig>, index = 0) => (await getAnalysisPageData(a.id, a.job.id, config))!.latest!.findings.find(f => f.requirementIndex === index)!;
const MASKED = { verdict: "insufficient_information", citations: [] };
// Stage F4 citation safety: a finding resting on a choice is never shown until the page can show one (F5). It is withheld
// after revocation masking, so an active answer's choice reads "isn't shown yet" and a lapsed one still reads "revoked".
// Stage F5: an active answer's valid choice shows with structured matching on.
const SHOWN = (id?: string) => ({ verdict: "possible", basis: "candidate_choice", ...(id ? { citations: [{ evidenceId: `choice:${id}` }] } : {}) });
const LAPSED = { verdict: "insufficient_information", citations: [], explanation: expect.stringMatching(/revoked/) };

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

it("created: a choice citation of an active answer stands, with every flag state", async () => {
  const a = await account([PLUMBING]);
  expect(await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(PLUMBING), config: on, submission: performed(a, ["0"]) })).toEqual({ ok: true });
  const row = await active(a);
  const choice = await storeChoiceFinding(a, row.id);
  expect(choice.id).toBe(`choice:${row.id}`);
  // F1's evidence id is kept; the choice id is the same answer's, never a new record.
  expect(row.evidenceId).toBe(`experience:${row.id}`);
  expect(choice).toMatchObject({ id: `choice:${row.id}`, statement: expect.stringContaining("Choice: I did this work myself") });
  expect(await shown(a, matching)).toMatchObject({ ...SHOWN(row.id), citations: [{ evidenceId: choice.id, quote: choice.statement }] });
  for (const config of OFF) expect(await shown(a, config), "flag off (F-9)").toMatchObject(MASKED);
});

it("corrected or replaced: the earlier answer's choice citation stops counting at once", async () => {
  const a = await account([PLUMBING]);
  await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(PLUMBING), config: on, submission: performed(a, ["0"]) });
  const first = await active(a);
  await storeChoiceFinding(a, first.id);
  expect(await shown(a, matching)).toMatchObject(SHOWN(first.id)); // control
  expect(await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: first.id, config: on, submission: performed(a, ["1"]) })).toEqual({ ok: true });
  await storeChoiceFinding(a, first.id); // a stale citation of the corrected version
  expect(await shown(a, matching), "corrected").toMatchObject(LAPSED);
  for (const config of OFF) expect(await shown(a, config), "corrected").toMatchObject(MASKED);

  // Replaced by a new structured answer (the earlier one is superseded).
  const second = await active(a);
  await storeChoiceFinding(a, second.id);
  expect(await shown(a, matching)).toMatchObject(SHOWN(second.id)); // control
  expect(await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(PLUMBING), config: on, submission: { involvement: "ASSISTED", alsoDidSome: "no", experienceId: a.role.id } })).toEqual({ ok: true });
  await storeChoiceFinding(a, second.id);
  expect(await shown(a, matching), "replaced").toMatchObject(LAPSED);
  for (const config of OFF) expect(await shown(a, config), "replaced").toMatchObject(MASKED);
  // The current answer's own choice still counts.
  const third = await active(a);
  await storeChoiceFinding(a, third.id);
  expect(await shown(a, matching)).toMatchObject(SHOWN(third.id));
});

it("revoked: masked with every flag state", async () => {
  const a = await account([PLUMBING]);
  await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(PLUMBING), config: on, submission: performed(a, ["0", "1"]) });
  const row = await active(a);
  await storeChoiceFinding(a, row.id);
  expect(await shown(a, matching), "control").toMatchObject(SHOWN(row.id));
  expect(await revokeAnswer({ supabaseAuthId: a.id, clarificationId: row.id, config: on })).toMatchObject({ ok: true });
  await storeChoiceFinding(a, row.id);
  expect(await shown(a, matching), "revoked").toMatchObject(LAPSED);
  for (const config of OFF) expect(await shown(a, config), "revoked").toMatchObject(MASKED);
});

it("permanently deleted: every stored choice citation of every version is scrubbed; nothing orphaned", async () => {
  const a = await account([PLUMBING]);
  await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(PLUMBING), config: on, submission: performed(a, ["0"]) });
  const first = await active(a);
  const older = await latest(a);
  await storeChoiceFinding(a, first.id);
  await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: first.id, config: on, submission: performed(a, ["1"]) });
  const second = await active(a);
  // A newer analysis cites the current version.
  const run = await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config: on, recheck: true });
  if (!run.ok) throw new Error(run.error);
  await storeChoiceFinding(a, second.id);
  const cites = async () => (await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } })).flatMap(x => (x.findings as Finding[]).flatMap(f => f.citations.map(c => c.evidenceId)));
  expect(await cites()).toEqual(expect.arrayContaining([`choice:${first.id}`, `choice:${second.id}`]));
  expect((await prisma.jobMatchAnalysis.findUniqueOrThrow({ where: { id: older.id } })).id).toBe(older.id);

  expect(await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: second.id, config: on })).toBe(true);
  const after = await cites();
  expect(after.filter(id => id.startsWith("choice:"))).toEqual([]);
  expect(after.filter(id => id.includes(first.id) || id.includes(second.id))).toEqual([]);
  expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
  for (const x of await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } })) {
    const findings = x.findings as Finding[];
    expect(findings.filter(f => f.basis === "candidate_choice")).toEqual([]);
    const counts = x.verdictCounts as Record<string, number>;
    expect(counts.possible).toBe(findings.filter(f => f.verdict === "possible").length);
  }
});

it("one answer's lapse never masks another answer's choice, or the rules' own evidence", async () => {
  const a = await account([PLUMBING, EXCEL]);
  await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(PLUMBING), config: on, submission: performed(a, ["0"]) });
  await saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(EXCEL), config: on, submission: { involvement: "TAUGHT", alsoDidSome: "no", experienceId: a.role.id } });
  const rows = await prisma.candidateClarification.findMany({ where: { userId: a.user.id, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  expect(await revokeAnswer({ supabaseAuthId: a.id, clarificationId: rows[0].id, config: on })).toMatchObject({ ok: true });
  await storeChoiceFinding(a, rows[0].id, 0);
  await storeChoiceFinding(a, rows[1].id, 1);
  for (const config of CONFIGS) {
    expect(await shown(a, config, 0)).toMatchObject(config === matching ? LAPSED : MASKED);
    expect(await shown(a, config, 1)).toMatchObject(config === matching ? SHOWN(rows[1].id) : MASKED);
  }
});

it("free-text answers: their citations, correction masking and deletion behave exactly as before", async () => {
  const a = await account(["Salesforce"]);
  expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Salesforce"), experienceId: a.role.id, detail: "Administered Salesforce for 80 sales staff across three offices.", config: on })).toMatchObject({ ok: true });
  const first = await active(a);
  const f = (await latest(a)).findings as Finding[];
  expect(f[0]).toMatchObject({ verdict: "supported", basis: "candidate_answer", citations: [{ evidenceId: `experience:${first.id}` }] });
  expect(await correctAnswer({ supabaseAuthId: a.id, clarificationId: first.id, detail: "Administered Salesforce for 90 sales staff across three offices.", config: on })).toMatchObject({ ok: true });
  const current = (await latest(a)).findings as Finding[];
  expect(current[0].citations[0].evidenceId).toBe(`experience:${(await active(a)).id}`);
  expect(await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: (await active(a)).id, config: on })).toBe(true);
  for (const x of await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } })) expect((x.findings as Finding[]).flatMap(y => y.citations.map(c => c.evidenceId)).filter(id => id.startsWith("experience:") && id !== `experience:${a.role.id}`)).toEqual([]);
});
