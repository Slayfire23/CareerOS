import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Phase 5.3 Stage F1, against the local test database (fictional data only):
// - the recognition-version audit columns (migration 20261114010000_structured_matching_audit);
// - evidence ids for structured answers (formVersion 2), their backfill, and their lifecycle (correction, revocation,
//   permanent deletion, masking).
// Matching still ignores structured answers: every verdict and stored finding is unchanged.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { answerPartQuestion, confirmWithDetail, correctStructuredAnswer, deleteAnswerPermanently, revokeAnswer, saveStructuredAnswer } from "@/lib/ai/clarification-review";
import { readAiConfig } from "@/lib/ai/config";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { RECOGNITION_VERSION } from "@/lib/ai/rules/split-recognition";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const on = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true", STRUCTURED_OWNERSHIP_FORM_ENABLED: "true" });
const reviewOnly = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true" });
const plain = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200" });
const PLUMBING = "Install and repair residential plumbing"; // an approved split (A58): the form asks it part by part
const SALESFORCE = "Salesforce"; // not a split: asked whole
const STRONG = "I install and repair residential plumbing myself every day: water heaters, pipes, toilets and faucets.";
const MIGRATION = readFileSync("prisma/migrations/20261114010000_structured_matching_audit/migration.sql", "utf8");
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf("UPDATE \"CandidateClarification\""));

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
const latest = (a: Account) => prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId: a.user.id, savedJobId: a.job.id }, orderBy: { createdAt: "desc" } });
const rerun = async (a: Account, config = on) => { const run = await runJobAnalysis({ supabaseAuthId: a.id, jobId: a.job.id, provider: "rules", config, recheck: true }); if (!run.ok) throw new Error(run.error); };
const key = (text: string) => questionKey(text, "work_detail");
const saveStructured = (a: Account, text: string, submission: Parameters<typeof saveStructuredAnswer>[0]["submission"]) => saveStructuredAnswer({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(text), config: on, submission });
const performed = (a: Account, extra: Record<string, unknown> = {}) => ({ involvement: "PERFORMED", frequency: "MOST_DAYS", recency: "CURRENT", experienceId: a.role.id, ...extra });
/** What matching produced, without what differs run to run. */
const results = async (a: Account) => { const x = await latest(a); return { findings: x.findings, verdictCounts: x.verdictCounts, methodVersion: x.methodVersion, recognitionVersion: x.recognitionVersion }; };
/** A stored finding citing this evidence id, as a Stage F finding would. Written straight to the newest analysis. */
async function citeInLatest(a: Account, evidenceId: string) {
  const x = await latest(a);
  const findings = (x.findings as Finding[]).map((f, i) => (i === 0 ? { ...f, verdict: "possible" as const, citations: [{ evidenceId, quote: "water heaters" }] } : f));
  await prisma.jobMatchAnalysis.update({ where: { id: x.id }, data: { findings: JSON.parse(JSON.stringify(findings)) } });
}
const shownFirst = async (a: Account, config = on) => (await getAnalysisPageData(a.id, a.job.id, config))!.latest!.findings[0];

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

it("the audit columns exist, are nullable, and the database enforces the version format", async () => {
  const cols = await prisma.$queryRawUnsafe<{ table_name: string; is_nullable: string; character_maximum_length: number }[]>(
    `select table_name, is_nullable, character_maximum_length from information_schema.columns where column_name = 'recognitionVersion' order by table_name`);
  expect(cols).toEqual([{ table_name: "ClarificationEvent", is_nullable: "YES", character_maximum_length: 20 }, { table_name: "JobMatchAnalysis", is_nullable: "YES", character_maximum_length: 20 }]);
  const a = await account([SALESFORCE]);
  const analysis = await latest(a);
  const event = await prisma.clarificationEvent.create({ data: { userId: a.user.id, action: "CONFIRMED", rulesVersion: "rules-v21" } });
  expect(event.recognitionVersion).toBeNull();
  for (const ok of ["splits-v1.1", "splits-v2", "splits-v10.0.3"]) {
    await prisma.jobMatchAnalysis.update({ where: { id: analysis.id }, data: { recognitionVersion: ok } });
    await prisma.clarificationEvent.update({ where: { id: event.id }, data: { recognitionVersion: ok } });
  }
  for (const bad of ["rules-v21", "splits-v", "splits-v1.", "SPLITS-V1.1", "splits-v1.1-x", "v1.1"]) {
    await expect(prisma.jobMatchAnalysis.update({ where: { id: analysis.id }, data: { recognitionVersion: bad } }), bad).rejects.toThrow();
    await expect(prisma.clarificationEvent.update({ where: { id: event.id }, data: { recognitionVersion: bad } }), bad).rejects.toThrow();
  }
});

it("analyses record no recognition version: no structured answer is applied in F1, with any flag", async () => {
  const a = await account([PLUMBING, SALESFORCE]);
  expect((await latest(a)).recognitionVersion).toBeNull();
  expect(await saveStructured(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }))).toEqual({ ok: true });
  for (const config of [on, reviewOnly, plain]) {
    await rerun(a, config);
    expect((await latest(a)).recognitionVersion).toBeNull();
  }
  expect(await prisma.jobMatchAnalysis.count({ where: { userId: a.user.id, recognitionVersion: { not: null } } })).toBe(0);
});

it("events: a recognition version only where the approved splits or a part question were used", async () => {
  const a = await account([PLUMBING, SALESFORCE]);
  // Free text: never.
  expect(await confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(SALESFORCE), experienceId: a.role.id, detail: "Administered Salesforce for 80 sales staff across three offices.", config: on })).toMatchObject({ ok: true });
  // A split, with part ticks: the version whose approved parts were used.
  expect(await saveStructured(a, PLUMBING, performed(a, { detail: "I send plumbers out to install water heaters, and I repair the leaks in homes myself.", parts: ["0", "1"] }))).toEqual({ ok: true });
  const events = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id }, orderBy: { createdAt: "asc" } });
  const structured = events.find(e => e.involvement === "PERFORMED")!;
  expect(structured.recognitionVersion).toBe(RECOGNITION_VERSION);
  expect(events.filter(e => e !== structured).every(e => e.recognitionVersion === null)).toBe(true);

  // Part questions come from the recognition reading: their events carry its version, and so does the correction.
  const answer = (await getAnalysisPageData(a.id, a.job.id, on))!.review!.answers.find(x => x.structured)!;
  const q = answer.structured!.questions.find(x => x.kind === "others_did_it" || x.kind === "what_did_you_do") as { partIndex: number } | undefined;
  expect(q).toBeDefined();
  expect(await answerPartQuestion({ supabaseAuthId: a.id, clarificationId: answer.id, partIndex: q!.partIndex, response: "no", config: on })).toEqual({ ok: true });
  const later = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id, action: { in: ["CORRECTED", "PART_Q_DONE"] } } });
  expect(later.map(e => [e.action, e.recognitionVersion]).sort()).toEqual([["CORRECTED", RECOGNITION_VERSION], ["PART_Q_DONE", RECOGNITION_VERSION]]);
});

it("events: no recognition version for a structured answer without parts, or a 'haven't done this'", async () => {
  const a = await account([SALESFORCE, PLUMBING]);
  expect(await saveStructured(a, SALESFORCE, { involvement: "SUPERVISED", alsoDidSome: "no", experienceId: a.role.id })).toEqual({ ok: true });
  expect(await saveStructured(a, PLUMBING, { involvement: "NOT_DONE" })).toEqual({ ok: true });
  const events = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id } });
  expect(events.map(e => [e.involvement, e.recognitionVersion]).sort()).toEqual([["NOT_DONE", null], ["SUPERVISED", null]]);
});

it("evidence ids: each structured role answer has its own, set when saved; a 'haven't done this' has none", async () => {
  const a = await account([PLUMBING, SALESFORCE]);
  expect(await saveStructured(a, PLUMBING, performed(a, { parts: ["0"] }))).toEqual({ ok: true });
  expect(await saveStructured(a, SALESFORCE, { involvement: "NOT_DONE" })).toEqual({ ok: true });
  const rows = await prisma.candidateClarification.findMany({ where: { userId: a.user.id }, orderBy: { createdAt: "asc" } });
  expect(rows.map(r => [r.involvement, r.evidenceId])).toEqual([["PERFORMED", `experience:${rows[0].id}`], ["NOT_DONE", null]]);
});

it("correction and replacement: every version keeps its own evidence id; none is shared or reused", async () => {
  const a = await account([PLUMBING]);
  expect(await saveStructured(a, PLUMBING, performed(a, { parts: ["0"] }))).toEqual({ ok: true });
  expect(await saveStructured(a, PLUMBING, { involvement: "SUPERVISED", alsoDidSome: "no", experienceId: a.role.id })).toEqual({ ok: true });
  const active = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  expect(await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: active.id, config: on, submission: performed(a, { parts: ["1"] }) })).toEqual({ ok: true });
  const rows = await prisma.candidateClarification.findMany({ where: { userId: a.user.id }, orderBy: { createdAt: "asc" } });
  expect(rows.map(r => r.status)).toEqual(["SUPERSEDED", "SUPERSEDED", "ACTIVE"]);
  expect(rows.map(r => r.evidenceId)).toEqual(rows.map(r => `experience:${r.id}`));
  expect(new Set(rows.map(r => r.evidenceId)).size).toBe(3);
});

it("masking: a stored citation of a structured answer is masked once it's corrected, replaced or revoked, and only then", async () => {
  const a = await account([PLUMBING]);
  expect(await saveStructured(a, PLUMBING, performed(a, { parts: ["0"] }))).toEqual({ ok: true });
  const first = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  await citeInLatest(a, first.evidenceId!);
  // While the answer is active, nothing is masked (control).
  expect(await shownFirst(a)).toMatchObject({ verdict: "possible", citations: [{ evidenceId: first.evidenceId }] });

  // Corrected: the earlier version no longer counts, so a citation of it is stale and masked.
  expect(await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: first.id, config: on, submission: performed(a, { parts: ["1"] }) })).toEqual({ ok: true });
  for (const config of [on, reviewOnly, plain]) expect(await shownFirst(a, config), "after correction").toMatchObject({ verdict: "insufficient_information", citations: [] });

  // Revoked: the same.
  const second = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  await citeInLatest(a, second.evidenceId!);
  expect(await shownFirst(a)).toMatchObject({ verdict: "possible" });
  expect(await revokeAnswer({ supabaseAuthId: a.id, clarificationId: second.id, config: on })).toMatchObject({ ok: true });
  for (const config of [on, reviewOnly, plain]) expect(await shownFirst(a, config), "after revocation").toMatchObject({ verdict: "insufficient_information", citations: [] });
});

it("permanent deletion removes the answer, every earlier version, and every stored citation of them", async () => {
  const a = await account([PLUMBING]);
  expect(await saveStructured(a, PLUMBING, performed(a, { parts: ["0"] }))).toEqual({ ok: true });
  const first = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  expect(await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: first.id, config: on, submission: performed(a, { parts: ["1"] }) })).toEqual({ ok: true });
  const second = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE" } });
  // Stored analyses cite both versions.
  await citeInLatest(a, second.evidenceId!);
  const older = await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId: a.user.id }, orderBy: { createdAt: "asc" } });
  await prisma.jobMatchAnalysis.update({ where: { id: older.id }, data: { findings: JSON.parse(JSON.stringify((older.findings as Finding[]).map(f => ({ ...f, verdict: "possible", citations: [{ evidenceId: first.evidenceId, quote: "water heaters" }] })))) } });

  expect(await deleteAnswerPermanently({ supabaseAuthId: a.id, clarificationId: second.id, config: on })).toBe(true);
  expect(await prisma.candidateClarification.count({ where: { userId: a.user.id } })).toBe(0);
  expect(await prisma.clarificationPart.count({ where: { userId: a.user.id } })).toBe(0);
  for (const x of await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } })) {
    const cited = (x.findings as Finding[]).flatMap(f => f.citations.map(c => c.evidenceId));
    expect(cited).not.toContain(first.evidenceId);
    expect(cited).not.toContain(second.evidenceId);
  }
  // The audit trail keeps that something was deleted, nothing of what was said.
  const events = await prisma.clarificationEvent.findMany({ where: { userId: a.user.id } });
  expect(events.filter(e => e.action === "DELETED").length).toBe(2);
  expect(events.every(e => e.requirementText === null || e.action === "DELETED")).toBe(true);
});

it("backfill: a structured answer saved before F1 gets experience:<id>; nothing else changes, and it runs once", async () => {
  const a = await account([PLUMBING]);
  // As Stage E saved them: no evidence id.
  const make = (data: Record<string, unknown>) => prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: PLUMBING, formVersion: 2, ...data } as never });
  const role = await make({ outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, involvement: "PERFORMED", frequency: "WEEKLY", recency: "CURRENT" });
  const revoked = await make({ outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, involvement: "ASSISTED", status: "REVOKED" });
  const denied = await make({ outcome: "DENIED", involvement: "NOT_DONE" });
  const free = await prisma.candidateClarification.create({ data: { userId: a.user.id, savedJobId: a.job.id, requirementText: SALESFORCE, outcome: "ROLE_DETAIL_ADDED", experienceId: a.role.id, detail: "Administered Salesforce for 80 staff." } });
  await prisma.candidateClarification.update({ where: { id: free.id }, data: { evidenceId: `experience:${free.id}` } });
  const before = await results(a);

  await prisma.$executeRawUnsafe(BACKFILL);
  const after = Object.fromEntries((await prisma.candidateClarification.findMany({ where: { userId: a.user.id } })).map(r => [r.id, r.evidenceId]));
  expect(after).toEqual({ [role.id]: `experience:${role.id}`, [revoked.id]: `experience:${revoked.id}`, [denied.id]: null, [free.id]: `experience:${free.id}` });
  expect(await prisma.$executeRawUnsafe(BACKFILL)).toBe(0);
  expect(await results(a)).toEqual(before);
});

it("isolation: verdicts and stored results are identical before and after saving, correcting and revoking structured answers", async () => {
  const a = await account([PLUMBING, SALESFORCE]);
  await rerun(a);
  const before = await results(a);
  expect(await saveStructured(a, PLUMBING, performed(a, { detail: STRONG, parts: ["0", "1"] }))).toEqual({ ok: true });
  expect(await saveStructured(a, SALESFORCE, { involvement: "NOT_DONE" })).toEqual({ ok: true });
  for (const config of [on, reviewOnly, plain]) { await rerun(a, config); expect(await results(a)).toEqual(before); }
  const active = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE", involvement: "PERFORMED" } });
  expect(await correctStructuredAnswer({ supabaseAuthId: a.id, clarificationId: active.id, config: on, submission: performed(a, { detail: STRONG, parts: ["1"] }) })).toEqual({ ok: true });
  await rerun(a);
  expect(await results(a)).toEqual(before);
  const corrected = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE", involvement: "PERFORMED" } });
  expect(await revokeAnswer({ supabaseAuthId: a.id, clarificationId: corrected.id, config: on })).toMatchObject({ ok: true });
  await rerun(a);
  expect(await results(a)).toEqual(before);
  // Nothing stored cites a structured answer.
  const structuredIds = (await prisma.candidateClarification.findMany({ where: { userId: a.user.id, formVersion: 2 } })).map(r => r.evidenceId).filter(Boolean);
  for (const x of await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id } })) expect((x.findings as Finding[]).flatMap(f => f.citations.map(c => c.evidenceId)).filter(id => structuredIds.includes(id))).toEqual([]);
});
