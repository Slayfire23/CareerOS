import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// V1 (D4): final approval of an assessment. Real application functions and Prisma (local test database only); rules
// provider, no AI service.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import type { AiConfig } from "@/lib/ai/config";
import { approveAssessment, getAnalysisPageData, runJobAnalysis, saveAnalysisFeedback } from "@/lib/ai/analysis";
import { RULES_VERSION } from "@/lib/ai/rules/engine";

const CONFIG: AiConfig = {
  enabled: true, serviceUrl: "http://127.0.0.1:1", secret: "integration-secret-0123456789abcdefghij", serviceProblem: null, dailyLimit: 20, attemptLimit: 60, cloud: null, cloudReason: "off", localAi: null,
};
let identities: string[] = [];
let accountA: string;
let accountB: string;
let verifiedDatabase = false;
const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });

const REQUIREMENTS = [
  { text: "Proficiency in SolidWorks", category: "Skills", priority: "Required", source: "" },
  { text: "Quuxflow administration", category: "Skills", priority: "Required", source: "" },
];
async function createReviewedJob(supabaseAuthId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } });
  const description = "Requirements:\n- Proficiency in SolidWorks\n- Quuxflow administration";
  return prisma.savedJob.create({ data: { userId: user.id, title: "Engineer", company: "Test Co", description, reviewedDescription: description, reviewVersion: 1, requirements: REQUIREMENTS } });
}
async function addSkill(supabaseAuthId: string, name: string) {
  const profile = await prisma.careerProfile.findFirstOrThrow({ where: { user: { supabaseAuthId } } });
  return prisma.technicalSkill.create({ data: { profileId: profile.id, name, normalizedName: name.toLowerCase() } });
}
const run = (supabaseAuthId: string, jobId: string) => runJobAnalysis({ supabaseAuthId, jobId, config: CONFIG, provider: "rules" });
const page = (supabaseAuthId: string, jobId: string) => getAnalysisPageData(supabaseAuthId, jobId, CONFIG);
async function decideAll(supabaseAuthId: string, jobId: string, choices: ("agree" | "disagree")[]) {
  for (const [i, choice] of choices.entries()) {
    const p = await page(supabaseAuthId, jobId);
    expect(await saveAnalysisFeedback({ supabaseAuthId, analysisId: p!.latest!.id, version: p!.latest!.feedbackVersion, requirementIndex: i, choice, note: i === 0 ? "Used it daily" : null })).toMatchObject({ ok: true });
  }
  return (await page(supabaseAuthId, jobId))!;
}
const approve = (supabaseAuthId: string, jobId: string, analysisId: string, feedbackVersion: number, note: string | null = null) =>
  approveAssessment({ supabaseAuthId, jobId, analysisId, feedbackVersion, note, config: CONFIG });

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  expect(rows).toEqual([{ name: "careeros_test" }]);
  verifiedDatabase = true;
});
beforeEach(async () => {
  if (!verifiedDatabase) throw new Error("Local test database verification failed.");
  accountA = randomUUID();
  accountB = randomUUID();
  identities = [accountA, accountB];
  for (const id of identities) { signIn(id); await ensureCurrentUserProfile(); }
});
afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});
afterAll(async () => { await prisma.$disconnect(); });

it("approves a current, fully decided analysis and stores a durable snapshot; nothing is raised", async () => {
  await addSkill(accountA, "SolidWorks");
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id)).toMatchObject({ ok: true });
  let p = (await page(accountA, job.id))!;
  expect(p.assessment!.undecided).toEqual([0, 1]);
  // Undecided: refused.
  expect(await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion)).toEqual({ ok: false, error: "undecided" });

  p = await decideAll(accountA, job.id, ["agree", "agree"]);
  const verdicts = p.latest!.findings.map(f => f.verdict);
  expect(verdicts[1]).toBe("insufficient_information");
  const result = await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion, "Ready to apply.");
  expect(result).toMatchObject({ ok: true, version: 1 });

  const stored = await prisma.assessmentApproval.findFirstOrThrow({ where: { savedJobId: job.id } });
  expect(stored).toMatchObject({ analysisId: p.latest!.id, version: 1, methodVersion: RULES_VERSION, requirementsVersion: 1, feedbackVersion: p.latest!.feedbackVersion, note: "Ready to apply." });
  const decisions = stored.decisions as { verdict: string; decision: string; recorded: string; note: string | null; evidenceIds: string[] }[];
  expect(decisions.map(d => d.verdict)).toEqual(verdicts);
  // Agreeing with "Not enough information" never turns it into credit.
  expect(decisions[1]).toMatchObject({ decision: "confirmed", recorded: "insufficient_information" });
  expect(decisions[0]).toMatchObject({ decision: "confirmed", note: "Used it daily" });
  // Reload: the approval is listed with its snapshot.
  const reloaded = (await page(accountA, job.id))!;
  expect(reloaded.approvals).toEqual([expect.objectContaining({ id: (result as { id: string }).id, version: 1, analysisId: p.latest!.id })]);
});

it("refuses a stale analysis, an older analysis, and a changed set of decisions", async () => {
  await addSkill(accountA, "SolidWorks");
  const job = await createReviewedJob(accountA);
  await run(accountA, job.id);
  const p = await decideAll(accountA, job.id, ["agree", "agree"]);
  // Changed since the person looked: refused.
  expect(await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion - 1)).toEqual({ ok: false, error: "changed" });
  // Stale: the profile changed.
  await addSkill(accountA, "Quuxflow");
  expect(await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion)).toEqual({ ok: false, error: "out_of_date" });
  // Stale: the rules version changed.
  await addSkill(accountA, "Unrelated").then(() => prisma.technicalSkill.deleteMany({ where: { name: { in: ["Quuxflow", "Unrelated"] }, profile: { user: { supabaseAuthId: accountA } } } }));
  await prisma.jobMatchAnalysis.update({ where: { id: p.latest!.id }, data: { methodVersion: "rules-v21" } });
  expect(await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion)).toEqual({ ok: false, error: "out_of_date" });
  await prisma.jobMatchAnalysis.update({ where: { id: p.latest!.id }, data: { methodVersion: RULES_VERSION } });
  // A newer analysis exists: the older one can't be approved.
  await run(accountA, job.id);
  expect(await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion)).toEqual({ ok: false, error: "not_latest" });
  expect(await prisma.assessmentApproval.count({ where: { savedJobId: job.id } })).toBe(0);
});

it("a recalculation keeps unchanged decisions and asks again where the result changed; a later approval is a new version", async () => {
  const job = await createReviewedJob(accountA);
  await run(accountA, job.id);
  let p = await decideAll(accountA, job.id, ["agree", "agree"]);
  const first = await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion);
  expect(first).toMatchObject({ ok: true, version: 1 });
  // New evidence: SolidWorks is now Supported; the Quuxflow decision is unchanged and carried.
  await addSkill(accountA, "SolidWorks");
  await run(accountA, job.id);
  p = (await page(accountA, job.id))!;
  expect(p.latest!.findings[0].verdict).toBe("supported");
  expect(p.assessment!.undecided).toEqual([0]);
  await decideAll(accountA, job.id, ["agree"]);
  p = (await page(accountA, job.id))!;
  const second = await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion);
  expect(second).toMatchObject({ ok: true, version: 2 });
  // The first approval is unchanged.
  const rows = await prisma.assessmentApproval.findMany({ where: { savedJobId: job.id }, orderBy: { version: "asc" } });
  expect(rows.map(r => r.version)).toEqual([1, 2]);
  expect((rows[0].decisions as { verdict: string }[])[0].verdict).toBe("insufficient_information");
  expect((rows[1].decisions as { verdict: string }[])[0].verdict).toBe("supported");
});

it("not claimed lowers what's recorded; another account can neither approve nor see it", async () => {
  await addSkill(accountA, "SolidWorks");
  const job = await createReviewedJob(accountA);
  await run(accountA, job.id);
  const p = await decideAll(accountA, job.id, ["disagree", "agree"]);
  const ok = await approve(accountA, job.id, p.latest!.id, p.latest!.feedbackVersion);
  expect(ok).toMatchObject({ ok: true });
  const stored = await prisma.assessmentApproval.findFirstOrThrow({ where: { savedJobId: job.id } });
  expect((stored.decisions as { verdict: string; recorded: string }[])[0]).toMatchObject({ verdict: "supported", recorded: "not_claimed" });

  // Account B: not found, for the job and for the analysis; nothing visible.
  expect(await approve(accountB, job.id, p.latest!.id, p.latest!.feedbackVersion)).toEqual({ ok: false, error: "not_found" });
  expect(await page(accountB, job.id)).toBeNull();
  const jobB = await createReviewedJob(accountB);
  expect(await approve(accountB, jobB.id, p.latest!.id, 0)).toMatchObject({ ok: false });
  // The database refuses an approval pointing at another user's analysis.
  const userB = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: accountB } });
  await expect(prisma.assessmentApproval.create({ data: { userId: userB.id, savedJobId: jobB.id, analysisId: p.latest!.id, version: 1, methodVersion: RULES_VERSION, requirementsVersion: 1, profileFingerprint: "a".repeat(64), feedbackVersion: 0, decisions: [{}], summary: {} } })).rejects.toThrow();
  // Shapes are enforced.
  const userA = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: accountA } });
  await expect(prisma.assessmentApproval.create({ data: { userId: userA.id, savedJobId: job.id, analysisId: p.latest!.id, version: 9, methodVersion: RULES_VERSION, requirementsVersion: 1, profileFingerprint: "a".repeat(64), feedbackVersion: 0, decisions: [], summary: {} } })).rejects.toThrow();
  await expect(prisma.assessmentApproval.create({ data: { userId: userA.id, savedJobId: job.id, analysisId: p.latest!.id, version: 0, methodVersion: RULES_VERSION, requirementsVersion: 1, profileFingerprint: "a".repeat(64), feedbackVersion: 0, decisions: [{}], summary: {} } })).rejects.toThrow();
  // Deleting the job removes its approvals with it.
  await prisma.savedJob.delete({ where: { id: job.id } });
  expect(await prisma.assessmentApproval.count({ where: { savedJobId: job.id } })).toBe(0);
});
