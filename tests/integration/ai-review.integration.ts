import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Exception review, end to end, against the local test database. Fictional data only.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { ANSWER_DAILY_LIMIT, confirmWithDetail, confirmWithEntry, correctAnswer, deleteAnswerPermanently, denyQuestion, revokeAnswer, skipQuestion } from "@/lib/ai/clarification-review";
import { readAiConfig } from "@/lib/ai/config";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const on = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true" });
const off = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200" });

async function addJob(userId: string, supabaseAuthId: string, requirements: { text: string; category: string }[], config = on) {
  const description = "Fictional listing.";
  const job = await prisma.savedJob.create({ data: { userId, title: "Coordinator", company: `Invented ${randomUUID().slice(0, 6)}`, description, reviewedDescription: description, reviewVersion: 1, requirements: requirements.map(r => ({ priority: "Required", source: description, ...r })) } as never });
  const run = await runJobAnalysis({ supabaseAuthId, jobId: job.id, provider: "rules", config });
  if (!run.ok) throw new Error(run.error);
  return { job, analysisId: run.analysisId };
}
async function account(requirements: { text: string; category: string }[], config = on) {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Clinic Assistant", company: "Invented Clinic", startMonth: "2020-01", endMonth: null, description: "Answered phones." } });
  return { id, user, role, ...(await addJob(user.id, id, requirements, config)) };
}
const latest = (userId: string, jobId: string) => prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId, savedJobId: jobId }, orderBy: { createdAt: "desc" } });
const findings = async (userId: string, jobId: string) => (await latest(userId, jobId)).findings as Finding[];
const key = (text: string) => questionKey(text, "work_detail");
const P = [{ text: "Phlebotomy", category: "Skills" }];
const HONEST = "Drew blood from about 20 patients each morning using vacuum tubes.";

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

it("the workflow end to end: question, answer, recheck, verdict, evidence, with no AI service", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const a = await account(P);
  let page = await getAnalysisPageData(a.id, a.job.id, on);
  expect(page!.review!.queue.questions[0].requirementTexts).toEqual(["Phlebotomy"]);

  const result = await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  expect(result).toMatchObject({ ok: true, changes: [{ text: "Phlebotomy", before: "insufficient_information", after: "supported" }] });
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();

  const [f] = await findings(a.user.id, a.job.id);
  expect(f).toMatchObject({ verdict: "supported", basis: "candidate_answer", rulesOnlyVerdict: "insufficient_information", evidenceSources: ["candidate_answer"] });
  expect(f.citations[0].quote).toContain("Drew blood");

  page = await getAnalysisPageData(a.id, a.job.id, on);
  expect(page!.review!.queue.questions).toEqual([]);
  expect(page!.review!.answers[0]).toMatchObject({ detail: HONEST, status: "ACTIVE" });
  expect(page!.review!.changes[0]).toMatchObject({ before: "insufficient_information", after: "supported" });
  // The role's own text isn't touched: the answer's source stays separate.
  expect((await prisma.professionalExperience.findUniqueOrThrow({ where: { id: a.role.id } })).description).toBe("Answered phones.");
});

it("a bare yes saves nothing", async () => {
  const a = await account(P);
  const result = await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: "Yes", config: on });
  expect(result).toMatchObject({ ok: false, error: "invalid" });
  expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
});

it("deny gives Not supported, correcting replaces it, and revoking goes back", async () => {
  const a = await account(P);
  await denyQuestion({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), config: on });
  expect((await findings(a.user.id, a.job.id))[0]).toMatchObject({ verdict: "gap", basis: "candidate_denied", evidenceSources: ["candidate_answer"] });
  const denial = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, outcome: "DENIED" } });
  expect((await revokeAnswer({ supabaseAuthId: a.id, clarificationId: denial.id, config: on })).ok).toBe(true);
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
});

it("edits take effect at once, and the earlier version stops counting", async () => {
  const a = await account(P);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  const first = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  const result = await correctAnswer({ supabaseAuthId: a.id, clarificationId: first.id, detail: "Greeted visitors and answered phones at the front desk.", config: on });
  expect(result.ok).toBe(true);
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  expect((await prisma.candidateClarification.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("SUPERSEDED");
});

it("a revoked answer stops counting everywhere at once, even on a job not run again", async () => {
  const a = await account(P);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  const second = await addJob(a.user.id, a.id, [{ text: "Venipuncture", category: "Skills" }]);
  expect((await findings(a.user.id, second.job.id))[0].verdict).toBe("supported");

  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  await revokeAnswer({ supabaseAuthId: a.id, clarificationId: row.id, config: on });
  // The second job wasn't rerun, and its stored result still says Supported underneath.
  const page = await getAnalysisPageData(a.id, second.job.id, on);
  expect(page!.latest!.findings[0]).toMatchObject({ verdict: "insufficient_information", citations: [] });
  expect(page!.latest!.verdictCounts.supported).toBe(0);
  expect(page!.review!.queue.questions).toHaveLength(1);
});

it("permanent deletion removes the words and every stored copy, keeping only an event without them", async () => {
  const a = await account(P);
  const WORDS = "Drew blood from about 20 patients each morning at Zebrafish Clinic.";
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: WORDS, config: on });
  await addJob(a.user.id, a.id, [{ text: "Venipuncture", category: "Skills" }]);
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  await correctAnswer({ supabaseAuthId: a.id, clarificationId: row.id, detail: "Drew blood from patients on every shift, about Zebrafish tests.", config: on });
  const active = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });

  expect(await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: active.id, config: on })).toBe(true);

  expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
  const analyses = await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } });
  expect(analyses.length).toBeGreaterThan(1);
  for (const x of analyses) expect(JSON.stringify([x.findings, x.aiSuggestions, x.requirements])).not.toMatch(/Zebrafish|Drew blood/);
  const events = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id } });
  expect(events.some(e => e.action === "DELETED")).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/Zebrafish|Drew blood/);
});

it("deleting a credential answer removes the entry it made", async () => {
  const a = await account([{ text: "CPR certification", category: "Other" }]);
  const entry = { qualification: "CPR certification", institution: "Invented Board", startMonth: "2024-06", endMonth: "2024-06", fieldOfStudy: null, description: null };
  const r = await confirmWithEntry({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: questionKey("CPR certification", "credential"), entry, config: on });
  expect(r).toMatchObject({ ok: true, changes: [{ after: "supported" }] });
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: row.id, config: on });
  expect(await prisma.education.count({ where: { profileId: a.user.careerProfile!.id } })).toBe(0);
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
});

it("a question isn't asked again on another job, under another reviewed name", async () => {
  const a = await account(P);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  const second = await addJob(a.user.id, a.id, [{ text: "Venipuncture", category: "Skills" }, { text: "Payroll", category: "Skills" }]);
  const page = await getAnalysisPageData(a.id, second.job.id, on);
  expect(page!.review!.queue.questions.map(q => q.requirementTexts)).toEqual([["Payroll"]]);
  expect(page!.latest!.findings[0].verdict).toBe("supported");
});

it("one answer covers each requirement in a grouped question, judged separately", async () => {
  const a = await account([{ text: "Epic charting", category: "Skills" }, { text: "Epic EHR", category: "Skills" }]);
  const page = await getAnalysisPageData(a.id, a.job.id, on);
  expect(page!.review!.queue.questions).toHaveLength(1);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: page!.review!.queue.questions[0].key, experienceId: a.role.id, detail: "Charted patient assessments in Epic on every shift.", config: on });
  const f = await findings(a.user.id, a.job.id);
  expect(f.map(x => x.verdict)).toEqual(["supported", "possible"]);
});

it("skipping changes nothing, and stops the question for this job only", async () => {
  const a = await account(P);
  await skipQuestion({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), config: on });
  expect((await getAnalysisPageData(a.id, a.job.id, on))!.review!.queue.questions).toEqual([]);
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
  const second = await addJob(a.user.id, a.id, P);
  expect((await getAnalysisPageData(a.id, second.job.id, on))!.review!.queue.questions).toHaveLength(1);
});

it("no account can answer, correct, revoke, or delete for another", async () => {
  const a = await account(P);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  const b = await account(P);
  expect(await confirmWithDetail({ supabaseAuthId: b.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: b.role.id, detail: HONEST, config: on })).toMatchObject({ ok: false, error: "not_found" });
  expect(await confirmWithDetail({ supabaseAuthId: b.id, analysisId: b.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on })).toMatchObject({ ok: false, error: "not_found" });
  expect(await correctAnswer({ supabaseAuthId: b.id, clarificationId: row.id, detail: HONEST, config: on })).toMatchObject({ ok: false, error: "not_found" });
  expect(await revokeAnswer({ supabaseAuthId: b.id, clarificationId: row.id, config: on })).toMatchObject({ ok: false, error: "not_found" });
  expect(await deleteAnswerPermanently({ supabaseAuthId: b.id, clarificationId: row.id, config: on })).toBe(false);
  expect(await prisma.candidateClarification.count({ where: { id: row.id, status: "ACTIVE" } })).toBe(1);
  expect((await findings(b.user.id, b.job.id))[0].verdict).toBe("insufficient_information");
});

it("the answer limit holds under concurrent requests, deleting doesn't reset it, and revoking still works", async () => {
  const a = await account(P);
  await prisma.clarificationEvent.createMany({ data: Array.from({ length: ANSWER_DAILY_LIMIT - 1 }, () => ({ userId: a.user.id, action: "CONFIRMED", rulesVersion: "test" })) });
  const results = await Promise.all([1, 2, 3].map(() => confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on })));
  expect(results.filter(r => r.ok)).toHaveLength(1);
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  // At the limit, someone can still fix a mistake.
  expect((await correctAnswer({ supabaseAuthId: a.id, clarificationId: row.id, detail: "Drew blood from about 12 patients on the morning shift.", config: on })).ok).toBe(true);
  const current = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  expect((await revokeAnswer({ supabaseAuthId: a.id, clarificationId: current.id, config: on })).ok).toBe(true);
  await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: current.id, config: on });
  const fresh = await latest(a.user.id, a.job.id);
  expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId: fresh.id, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on })).toMatchObject({ ok: false, error: "rate_limited" });
});

it("rechecks don't use the daily analysis limit", async () => {
  const limited = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "1", CLARIFICATION_REVIEW_ENABLED: "true" });
  const a = await account(P);
  const result = await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: limited });
  expect(result).toMatchObject({ ok: true, changes: [{ after: "supported" }] });
  expect(await prisma.aiAnalysisRun.count({ where: { userId: a.user.id, isRecheck: true, countsTowardLimit: false } })).toBe(1);
});

it("with the flag off, nothing is available, and verdicts ignore linked answers", async () => {
  const a = await account(P, off);
  expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: off })).toMatchObject({ ok: false, error: "disabled" });
  expect((await getAnalysisPageData(a.id, a.job.id, off))!.review).toBeNull();
  // An answer saved while the flag was on is still ordinary evidence with it off, read by the ordinary rules only.
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config: off });
  expect((await findings(a.user.id, a.job.id))[0].verdict).toBe("insufficient_information");
});

it("the event table denies browser access, and an event outlives its answer", async () => {
  const a = await account(P);
  const rows = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'ClarificationEvent'`;
  expect(rows[0].relrowsecurity).toBe(true);
  await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key("Phlebotomy"), experienceId: a.role.id, detail: HONEST, config: on });
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id } });
  await prisma.professionalExperience.delete({ where: { id: a.role.id } });
  expect(await prisma.candidateClarification.count({ where: { id: row.id } })).toBe(0);
  expect(await prisma.clarificationEvent.count({ where: { clarificationId: row.id } })).toBeGreaterThan(0);
});
