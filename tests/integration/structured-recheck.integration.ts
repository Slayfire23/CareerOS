import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Phase 5.3 F6 remediation, D1: after an answer, the review runs the rules again and records what changed
// ("Changed by your answers", and a *_RESULT audit event). The "before" side must be what the person was shown: with
// structured matching off, a stored structured result doesn't count (F-9), so it must never appear as a change.
// Local test database, fictional data.
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { confirmWithDetail, saveStructuredAnswer } from "@/lib/ai/clarification-review";
import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import type { Finding } from "@/lib/ai/match-validation";
import { questionKey } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";

let identities: string[] = [];
let verifiedDatabase = false;
const flags = (extra: Record<string, string>) => readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "200", CLARIFICATION_REVIEW_ENABLED: "true", ...extra });
const form = flags({ STRUCTURED_OWNERSHIP_FORM_ENABLED: "true" });
const matching = flags({ STRUCTURED_OWNERSHIP_FORM_ENABLED: "true", STRUCTURED_MATCHING_ENABLED: "true" });
const PLUMBING = "Install and repair residential plumbing";
const SALESFORCE = "Salesforce";
const key = (t: string) => questionKey(t, "work_detail");

async function account() {
  const id = randomUUID();
  identities.push(id);
  auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
  await ensureCurrentUserProfile();
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id }, include: { careerProfile: true } });
  const role = await prisma.professionalExperience.create({ data: { profileId: user.careerProfile!.id, jobTitle: "Clinic Assistant", company: "Invented Clinic", startMonth: "2020-01", endMonth: null, description: "Answered phones." } });
  const job = await prisma.savedJob.create({ data: { userId: user.id, title: "Technician", company: `Invented ${randomUUID().slice(0, 6)}`, description: "x", reviewedDescription: "x", reviewVersion: 1, requirements: [PLUMBING, SALESFORCE].map(text => ({ priority: "Required", category: "Skills", text, source: "x" })) } as never });
  const first = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config: form });
  if (!first.ok) throw new Error(first.error);
  // A stored structured Supported: the plumbing answer, read with structured matching on.
  expect(await saveStructuredAnswer({ supabaseAuthId: id, analysisId: first.analysisId, questionKey: key(PLUMBING), config: form, submission: { involvement: "PERFORMED", frequency: "MOST_DAYS", recency: "CURRENT", experienceId: role.id, detail: "I install water heaters and repair leaking pipes in homes myself every day.", parts: ["0", "1"] } as never })).toEqual({ ok: true });
  const run = await runJobAnalysis({ supabaseAuthId: id, jobId: job.id, provider: "rules", config: matching, recheck: true });
  if (!run.ok) throw new Error(run.error);
  return { id, user, role, job, analysisId: run.analysisId };
}
type Account = Awaited<ReturnType<typeof account>>;
const stored = async (a: Account) => (await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { userId: a.user.id, savedJobId: a.job.id }, orderBy: { createdAt: "desc" } })).findings as Finding[];
const answerSalesforce = (a: Account, config: AiConfig) => confirmWithDetail({ supabaseAuthId: a.id, analysisId: a.analysisId, questionKey: key(SALESFORCE), experienceId: a.role.id, detail: "Administered Salesforce for 80 sales staff across three offices.", config });
const resultEvents = (a: Account) => prisma.clarificationEvent.findMany({ where: { userId: a.user.id, action: { endsWith: "_RESULT" } }, select: { requirementText: true, verdictBefore: true, verdictAfter: true } });

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

it("D1: with structured matching off, a stored structured result never shows up as a change; genuine changes still do", async () => {
  const a = await account();
  // 1. A stored structured Supported exists.
  expect((await stored(a)).map(f => [f.verdict, f.basis])).toEqual([["supported", "candidate_answer"], ["insufficient_information", "no_evidence"]]);
  // 2–3. Structured matching off: the page shows it masked.
  expect((await getAnalysisPageData(a.id, a.job.id, form))!.latest!.findings.map(f => f.verdict)).toEqual(["insufficient_information", "insufficient_information"]);
  const storedBefore = JSON.stringify(await prisma.jobMatchAnalysis.findMany({ where: { userId: a.user.id }, select: { id: true, findings: true, verdictCounts: true }, orderBy: { createdAt: "asc" } }));

  // 4. An unrelated answer triggers recheck().
  const result = await answerSalesforce(a, form);
  expect(result.ok).toBe(true);
  const changes = (result as { changes: { text: string; before: string; after: string | null }[] }).changes;
  // 5. No false Supported → Not enough information for plumbing; 7. the genuine change is reported.
  expect(changes).toEqual([{ text: SALESFORCE, before: "insufficient_information", after: "supported" }]);
  // 6–7. Persisted the same way, and shown the same way.
  expect(await resultEvents(a)).toEqual([{ requirementText: SALESFORCE, verdictBefore: "insufficient_information", verdictAfter: "supported" }]);
  expect((await getAnalysisPageData(a.id, a.job.id, form))!.review!.changes.map(c => [c.requirementText, c.before, c.after])).toEqual([[SALESFORCE, "insufficient_information", "supported"]]);
  // The historical analysis itself is untouched (only a new one was added).
  const earlier = JSON.parse(storedBefore) as { id: string; findings: unknown; verdictCounts: unknown }[];
  for (const x of earlier) expect(await prisma.jobMatchAnalysis.findUniqueOrThrow({ where: { id: x.id }, select: { id: true, findings: true, verdictCounts: true } })).toEqual(x);
});

it("D1: with structured matching on, behaviour is unchanged: the structured result stands and only the genuine change appears", async () => {
  const a = await account();
  const result = await answerSalesforce(a, matching);
  expect((result as { changes: unknown[] }).changes).toEqual([{ text: SALESFORCE, before: "insufficient_information", after: "supported" }]);
  expect(await resultEvents(a)).toEqual([{ requirementText: SALESFORCE, verdictBefore: "insufficient_information", verdictAfter: "supported" }]);
  expect((await stored(a)).map(f => f.verdict)).toEqual(["supported", "supported"]);
});

it("D1: revocation is still recorded as the genuine change it is (structured matching on)", async () => {
  const { revokeAnswer } = await import("@/lib/ai/clarification-review");
  const a = await account();
  const row = await prisma.candidateClarification.findFirstOrThrow({ where: { userId: a.user.id, status: "ACTIVE", formVersion: 2 } });
  const result = await revokeAnswer({ supabaseAuthId: a.id, clarificationId: row.id, config: matching });
  expect((result as { changes: unknown[] }).changes).toEqual([{ text: PLUMBING, before: "supported", after: "insufficient_information" }]);
  expect(await resultEvents(a)).toEqual([{ requirementText: PLUMBING, verdictBefore: "supported", verdictAfter: "insufficient_information" }]);
});
