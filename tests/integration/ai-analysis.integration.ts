import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Real application functions and the real Prisma connection (local test database only).
// The AI service is replaced by an in-process fake fetch, so no network and no AI provider.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import type { AiConfig } from "@/lib/ai/config";
import type { MatchRequest } from "@/lib/ai/evidence";
import { getAnalysisPageData, runJobAnalysis, saveAnalysisFeedback } from "@/lib/ai/analysis";

const CONFIG: AiConfig = {
  enabled: true, serviceUrl: "http://127.0.0.1:1", secret: "integration-secret-0123456789abcdefghij", dailyLimit: 20, attemptLimit: 60, cloud: null, cloudReason: "off",
};
let identities: string[] = [];
let accountA: string;
let accountB: string;
let verifiedDatabase = false;

const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });

/** A well-behaved fake service: finds a listed skill when the requirement names it. */
function fakeService(overrides: (request: MatchRequest, body: Record<string, unknown>) => void = () => {}) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as MatchRequest;
    const findings = request.requirements.map(r => {
      const skill = request.evidence.find(e => e.kind === "skill" && r.text.includes(e.name));
      return skill && skill.kind === "skill"
        ? { requirement_index: r.index, verdict: "supported", explanation: `You list ${skill.name} as a skill.`, citations: [{ evidence_id: skill.id, quote: skill.name }], caveats: [] }
        : { requirement_index: r.index, verdict: "insufficient_information", explanation: "Nothing found.", citations: [], caveats: [] };
    });
    const counts = { supported: 0, possible: 0, gap: 0, insufficient_information: 0 } as Record<string, number>;
    for (const f of findings) counts[f.verdict]++;
    const body: Record<string, unknown> = { request_id: request.request_id, findings, verdict_counts: counts, provider: request.provider, model: null, method_version: "rules-v1", usage: null, provider_request_id: null };
    overrides(request, body);
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

async function createReviewedJob(supabaseAuthId: string, requirements = [{ text: "Proficiency in SolidWorks", category: "Skills", priority: "Required", source: "" }]) {
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } });
  const description = "Requirements:\n- Proficiency in SolidWorks";
  return prisma.savedJob.create({ data: { userId: user.id, title: "Engineer", company: "Test Co", description, reviewedDescription: description, reviewVersion: 1, requirements } });
}

async function addSkill(supabaseAuthId: string, name: string) {
  const profile = await prisma.careerProfile.findFirstOrThrow({ where: { user: { supabaseAuthId } } });
  return prisma.technicalSkill.create({ data: { profileId: profile.id, name, normalizedName: name.toLowerCase() } });
}

const run = (supabaseAuthId: string, jobId: string, fetchImpl = fakeService(), config: AiConfig = CONFIG, now?: Date) =>
  runJobAnalysis({ supabaseAuthId, jobId, config, fetchImpl: fetchImpl as unknown as typeof fetch, now });

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
  for (const id of identities) {
    signIn(id);
    await ensureCurrentUserProfile();
  }
});

afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

it("runs an owner-scoped analysis and stores validated findings with an audit run", async () => {
  await addSkill(accountA, "SolidWorks");
  const job = await createReviewedJob(accountA);
  const result = await run(accountA, job.id);
  expect(result).toMatchObject({ ok: true });

  const analysis = await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { savedJobId: job.id }, include: { run: true } });
  expect(analysis.findings).toEqual([expect.objectContaining({ requirementIndex: 0, verdict: "supported" })]);
  expect(analysis.verdictCounts).toMatchObject({ supported: 1 });
  expect(analysis.run).toMatchObject({ status: "SUCCEEDED", errorCode: null, provider: "rules" });
  // The audit row holds metadata only.
  expect(Object.keys(analysis.run).sort()).toEqual([
    "billingState", "cacheReadTokens", "cacheWriteTokens", "confirmedMicroUsd", "countsTowardLimit", "errorCode", "finishedAt", "id", "inputTokens",
    "model", "outputTokens", "provider", "providerRequestId", "reconciledAt", "reservedMicroUsd", "savedJobId", "startedAt", "status", "userId",
  ]);
  expect(analysis.run).toMatchObject({ billingState: "NONE", reservedMicroUsd: 0, confirmedMicroUsd: null, countsTowardLimit: true });
});

it("refuses another account's job without creating any rows", async () => {
  const job = await createReviewedJob(accountA);
  const fetchImpl = fakeService();
  expect(await run(accountB, job.id, fetchImpl)).toEqual({ ok: false, error: "not_found" });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await prisma.aiAnalysisRun.count({ where: { user: { supabaseAuthId: { in: [accountA, accountB] } } } })).toBe(0);
  expect(await getAnalysisPageData(accountB, job.id, CONFIG)).toBeNull();
});

it("sends only the owner's own evidence, without other accounts' data", async () => {
  await addSkill(accountA, "SolidWorks");
  await addSkill(accountB, "SecretSkillOfB");
  const job = await createReviewedJob(accountA);
  const fetchImpl = fakeService();
  await run(accountA, job.id, fetchImpl);
  const sent = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string;
  expect(sent).toContain("SolidWorks");
  expect(sent).not.toContain("SecretSkillOfB");
  expect(sent).not.toContain("Test Co"); // company names are not sent
});

it.each([
  ["not reviewed", { reviewedDescription: null }, "not_reviewed"],
  ["stale review", { description: "Changed description" }, "out_of_date"],
  ["empty review", { requirements: [] }, "no_requirements"],
])("refuses a job with a %s and records no run", async (_label, data, error) => {
  const job = await createReviewedJob(accountA);
  await prisma.savedJob.update({ where: { id: job.id }, data });
  expect(await run(accountA, job.id)).toEqual({ ok: false, error });
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: job.id } })).toBe(0);
});

it.each([
  ["service down", () => vi.fn(async () => { throw new TypeError("fetch failed"); }), "service_unavailable"],
  ["malformed response", () => vi.fn(async () => new Response("{\"unexpected\":true}", { status: 200 })), "response_rejected"],
  ["foreign citation", () => fakeService((_r, body) => {
    (body.findings as { verdict: string; citations: unknown[] }[])[0].verdict = "supported";
    (body.findings as { citations: unknown[] }[])[0].citations = [{ evidence_id: `skill:${randomUUID()}`, quote: "Invented" }];
    body.verdict_counts = { supported: 1, possible: 0, gap: 0, insufficient_information: 0 };
  }), "response_rejected"],
  ["non-rules provider", () => fakeService((_r, body) => { body.provider = "anthropic"; }), "response_rejected"],
  ["provider output rejected", () => vi.fn(async () => new Response("{}", { status: 502 })), "provider_output_rejected"],
])("records a failed run and stores nothing when the %s", async (_label, makeFetch, error) => {
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id, makeFetch() as never)).toEqual({ ok: false, error });
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(0);
  const runs = await prisma.aiAnalysisRun.findMany({ where: { savedJobId: job.id } });
  expect(runs).toEqual([expect.objectContaining({ status: "FAILED", errorCode: error })]);
});

it("enforces the daily limit exactly under 25 concurrent requests", async () => {
  const job = await createReviewedJob(accountA);
  const results = await Promise.all(Array.from({ length: 25 }, () => run(accountA, job.id)));
  expect(results.filter(r => r.ok)).toHaveLength(20);
  expect(results.filter(r => !r.ok && r.error === "rate_limited")).toHaveLength(5);
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: job.id } })).toBe(20);
  // Another user's allowance is independent.
  const jobB = await createReviewedJob(accountB);
  expect(await run(accountB, jobB.id)).toMatchObject({ ok: true });
});

it("counts runs over a rolling 24 hours, including failures, and honours a lower configured limit", async () => {
  const job = await createReviewedJob(accountA);
  const config = { ...CONFIG, dailyLimit: 2 };
  const now = new Date();
  const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  expect(await run(accountA, job.id, fakeService(), config, old)).toMatchObject({ ok: true });
  expect(await run(accountA, job.id, vi.fn(async () => { throw new TypeError("down"); }) as never, config, now)).toMatchObject({ ok: false, error: "service_unavailable" });
  expect(await run(accountA, job.id, fakeService(), config, now)).toMatchObject({ ok: true });
  expect(await run(accountA, job.id, fakeService(), config, now)).toEqual({ ok: false, error: "rate_limited" });
});

it("saves Agree/Disagree feedback with version checks and owner scoping", async () => {
  const job = await createReviewedJob(accountA);
  await run(accountA, job.id);
  const analysis = await prisma.jobMatchAnalysis.findFirstOrThrow({ where: { savedJobId: job.id } });
  const base = { analysisId: analysis.id, requirementIndex: 0, note: "  Checked against the posting.  " };

  expect(await saveAnalysisFeedback({ ...base, supabaseAuthId: accountA, version: 0, choice: "agree" })).toEqual({ ok: true, version: 1 });
  expect(await saveAnalysisFeedback({ ...base, supabaseAuthId: accountA, version: 0, choice: "disagree" })).toEqual({ ok: false, error: "conflict" });
  expect(await saveAnalysisFeedback({ ...base, supabaseAuthId: accountB, version: 1, choice: "disagree" })).toEqual({ ok: false, error: "not_found" });
  expect(await saveAnalysisFeedback({ ...base, supabaseAuthId: accountA, version: 1, choice: "agree", requirementIndex: 9 })).toEqual({ ok: false, error: "invalid" });
  expect(await saveAnalysisFeedback({ ...base, supabaseAuthId: accountA, version: 1, choice: "agree", note: "x".repeat(501) })).toEqual({ ok: false, error: "invalid" });

  const saved = await prisma.jobMatchAnalysis.findUniqueOrThrow({ where: { id: analysis.id } });
  expect(saved.feedbackVersion).toBe(1);
  expect(saved.feedback).toEqual({ "0": expect.objectContaining({ choice: "agree", note: "Checked against the posting." }) });
  expect(await saveAnalysisFeedback({ ...base, supabaseAuthId: accountA, version: 1, choice: "clear" })).toEqual({ ok: true, version: 2 });
  expect((await prisma.jobMatchAnalysis.findUniqueOrThrow({ where: { id: analysis.id } })).feedback).toEqual({});
});

it("marks the analysis out of date when the reviewed requirements or the profile change", async () => {
  const job = await createReviewedJob(accountA);
  await run(accountA, job.id);
  let page = await getAnalysisPageData(accountA, job.id, CONFIG);
  expect(page?.latest?.outOfDate).toEqual({ requirements: false, profile: false });
  expect(page?.remainingToday).toBe(19);

  await addSkill(accountA, "GD&T");
  page = await getAnalysisPageData(accountA, job.id, CONFIG);
  expect(page?.latest?.outOfDate).toEqual({ requirements: false, profile: true });

  await prisma.savedJob.update({ where: { id: job.id }, data: { reviewVersion: 2 } });
  page = await getAnalysisPageData(accountA, job.id, CONFIG);
  expect(page?.latest?.outOfDate.requirements).toBe(true);
});

it("does nothing when the service is not configured", async () => {
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id, fakeService(), { enabled: false, reason: "off" })).toEqual({ ok: false, error: "not_configured" });
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: job.id } })).toBe(0);
});

it("database constraints reject cross-account links and inconsistent rows", async () => {
  const jobA = await createReviewedJob(accountA);
  await run(accountA, jobA.id);
  const runA = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: jobA.id } });
  const userB = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: accountB } });
  const base = { requirementsVersion: 1, profileFingerprint: "a".repeat(64), provider: "rules", methodVersion: "rules-v1", requirements: [], findings: [], verdictCounts: {} };

  // B's analysis may not point at A's job, nor at A's run.
  const runB = await prisma.aiAnalysisRun.create({ data: { userId: userB.id, provider: "rules" } });
  await expect(prisma.jobMatchAnalysis.create({ data: { ...base, userId: userB.id, savedJobId: jobA.id, runId: runB.id } })).rejects.toThrow();
  const jobB = await createReviewedJob(accountB);
  await expect(prisma.jobMatchAnalysis.create({ data: { ...base, userId: userB.id, savedJobId: jobB.id, runId: runA.id } })).rejects.toThrow();
  // Status/finish/error combinations must be consistent; JSON shapes are enforced.
  await expect(prisma.aiAnalysisRun.create({ data: { userId: userB.id, provider: "rules", status: "SUCCEEDED" } })).rejects.toThrow();
  await expect(prisma.aiAnalysisRun.create({ data: { userId: userB.id, provider: "rules", status: "FAILED", finishedAt: new Date(), errorCode: "Has Spaces" } })).rejects.toThrow();
  await expect(prisma.jobMatchAnalysis.create({ data: { ...base, findings: {}, userId: userB.id, savedJobId: jobB.id, runId: runB.id } })).rejects.toThrow();
});

it("deleting a job removes its analyses but keeps the metadata-only audit rows", async () => {
  const job = await createReviewedJob(accountA);
  await run(accountA, job.id);
  await prisma.savedJob.delete({ where: { id: job.id } });
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(0);
  const user = await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: accountA } });
  expect(await prisma.aiAnalysisRun.findMany({ where: { userId: user.id } })).toEqual([expect.objectContaining({ savedJobId: null, status: "SUCCEEDED" })]);
});

it("server actions reject signed-out callers, malformed input, and foreign ids", async () => {
  const { runJobMatch, saveMatchFeedback } = await import("@/app/jobs/match-actions");
  const job = await createReviewedJob(accountA);
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(entries)) data.append(k, v);
    return data;
  };

  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await runJobMatch({}, form({ jobId: job.id }))).error).toContain("session");
  expect((await saveMatchFeedback({}, form({ analysisId: randomUUID() }))).error).toContain("session");

  signIn(accountA);
  expect((await runJobMatch({}, form({ jobId: "not-a-uuid" }))).error).toBe("Invalid job selection.");
  const duplicated = form({ jobId: job.id });
  duplicated.append("jobId", job.id);
  expect((await runJobMatch({}, duplicated)).error).toBe("Invalid job selection.");
  // AI_SERVICE_URL is not set in the test environment, so the action reports it as unavailable.
  expect((await runJobMatch({}, form({ jobId: job.id }))).error).toContain("not available");

  signIn(accountB);
  expect((await runJobMatch({}, form({ jobId: job.id }))).error).toMatch(/not available|unavailable/);
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: job.id } })).toBe(0);
  const bad = await saveMatchFeedback({}, form({ analysisId: randomUUID(), version: "0", requirementIndex: "0", choice: "maybe", note: "" }));
  expect(bad.error).toContain("Agree or Disagree");
  const foreign = await saveMatchFeedback({}, form({ analysisId: randomUUID(), version: "0", requirementIndex: "0", choice: "agree", note: "" }));
  expect(foreign.error).toBe("Feedback could not be saved.");
});
