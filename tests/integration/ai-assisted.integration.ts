import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// AI-assisted analysis: rules findings and AI suggestions are stored apart, results survive local AI
// being off, and gating, rate limits, and account isolation are unchanged. The AI service is an
// in-process fake; fictional data only.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import type { AiConfig } from "@/lib/ai/config";
import type { MatchRequest } from "@/lib/ai/evidence";
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";
import { runJobMatch } from "@/app/jobs/match-actions";

const MODEL = "qwen3:8b";
let identities: string[] = [];
let accountA: string;
let accountB: string;
let verifiedDatabase = false;
const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
const userId = async (supabaseAuthId: string) => (await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } })).id;

const config = (allowed: string[], dailyLimit = 20): AiConfig => ({
  enabled: true, serviceUrl: "http://127.0.0.1:1", secret: "integration-secret-0123456789abcdefghij",
  dailyLimit, attemptLimit: 60, cloud: null, cloudReason: "off",
  localAi: { model: MODEL, allowedUserIds: new Set(allowed) },
} as AiConfig);

/** A fake AI service answering like the assisted provider. Requirement 0 is a rules match. */
function fakeAssisted(mode: "used" | "unavailable" | "local_verdict" | "bad_suggestion" = "used") {
  const requests: MatchRequest[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as MatchRequest;
    requests.push(request);
    const postgres = request.evidence.find(e => e.kind === "skill" && e.name === "Postgres")!;
    const helmsman = request.evidence.find(e => e.kind === "skill" && e.name === "Helmsman")!;
    const findings = [
      { requirement_index: 0, verdict: "supported", explanation: "You list “Postgres”, another name for this.", citations: [{ evidence_id: postgres.id, quote: "Postgres" }], caveats: [], method: "rules", basis: "alternate_name" },
      { requirement_index: 1, verdict: "insufficient_information", explanation: "Nothing in your profile speaks to this.", citations: [], caveats: [], method: mode === "local_verdict" ? "local_ai" : "rules", basis: "no_evidence" },
    ];
    const suggestions = mode === "unavailable" ? [] : [{
      requirement_index: 1, kind: "alternate_name", text: "“Helmsman” might be another name for this. Not verified.",
      citation: { evidence_id: helmsman.id, quote: mode === "bad_suggestion" ? "Tableau expert" : "Helmsman" }, known_to_rules: false,
    }];
    return new Response(JSON.stringify({
      request_id: request.request_id, findings, verdict_counts: { supported: 1, possible: 0, gap: 0, insufficient_information: 1 }, provider: "assisted", model: MODEL,
      method_version: `assisted/rules-v5+${MODEL}/assist-v1`, usage: mode === "unavailable" ? null : { input_tokens: 700, output_tokens: 40 }, provider_request_id: null,
      suggestions, ai_assist: mode === "unavailable" ? "unavailable" : "used",
    }), { status: 200 });
  });
  return { fetchImpl, requests };
}

async function createReviewedJob(supabaseAuthId: string) {
  const description = "Requirements:\n- Experience with PostgreSQL\n- Tableau";
  const requirements = [
    { text: "Experience with PostgreSQL", category: "Skills", priority: "Required", source: "" },
    { text: "Tableau", category: "Skills", priority: "Required", source: "" },
  ];
  return prisma.savedJob.create({
    data: { userId: await userId(supabaseAuthId), title: "Data Engineer", company: "Imaginary Pipes", description, reviewedDescription: description, reviewVersion: 1, requirements },
  });
}

const run = (supabaseAuthId: string, jobId: string, cfg: AiConfig, fetchImpl: unknown) =>
  runJobAnalysis({ supabaseAuthId, jobId, provider: "assisted", config: cfg, fetchImpl: fetchImpl as typeof fetch });

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
  const profile = await prisma.careerProfile.findFirstOrThrow({ where: { user: { supabaseAuthId: accountA } } });
  await prisma.technicalSkill.createMany({ data: [
    { profileId: profile.id, name: "Postgres", normalizedName: "postgres" },
    { profileId: profile.id, name: "Helmsman", normalizedName: "helmsman" },
  ] });
});

afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

it("stores suggestions apart from findings, free and without cloud consent", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl, requests } = fakeAssisted();
  const cfg = config([await userId(accountA)]);
  expect(await run(accountA, job.id, cfg, fetchImpl)).toMatchObject({ ok: true });
  expect(requests[0]).toMatchObject({ provider: "assisted" });
  expect(requests[0].budget).toBeUndefined();

  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id } });
  expect(saved).toMatchObject({ provider: "assisted", model: MODEL, status: "SUCCEEDED", billingState: "NONE", reservedMicroUsd: 0 });
  const latest = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;
  expect(latest?.findings.map(f => [f.method, f.basis, f.verdict])).toEqual([
    ["rules", "alternate_name", "supported"],
    ["rules", "no_evidence", "insufficient_information"],
  ]);
  expect(latest?.aiAssist).toBe("used");
  expect(latest?.suggestions).toEqual([expect.objectContaining({ requirementIndex: 1, kind: "alternate_name", knownToRules: false })]);
  expect(latest?.verdictCounts).toEqual({ supported: 1, possible: 0, gap: 0, insufficient_information: 1 });
});

it("when local AI is off, verified results are saved and say suggestions are unavailable", async () => {
  const job = await createReviewedJob(accountA);
  const cfg = config([await userId(accountA)]);
  expect(await run(accountA, job.id, cfg, fakeAssisted("unavailable").fetchImpl)).toMatchObject({ ok: true });
  const latest = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;
  expect(latest?.findings).toHaveLength(2);
  expect(latest).toMatchObject({ aiAssist: "unavailable", suggestions: [] });
});

it.each(["local_verdict", "bad_suggestion"] as const)("discards a response with %s", async mode => {
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id, config([await userId(accountA)]), fakeAssisted(mode).fetchImpl)).toEqual({ ok: false, error: "response_rejected" });
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(0);
});

it("is gated by the allow-list and never touches another account's job or profile", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = fakeAssisted();
  expect(await run(accountA, job.id, config([await userId(accountB)]), fetchImpl)).toEqual({ ok: false, error: "local_ai_unavailable" });
  expect(await run(accountB, job.id, config([await userId(accountB)]), fetchImpl)).toEqual({ ok: false, error: "not_found" });
  expect(await getAnalysisPageData(accountB, job.id, config([await userId(accountB)]))).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("counts against the same daily limit as any analysis", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = fakeAssisted();
  const cfg = config([await userId(accountA)], 1);
  expect(await run(accountA, job.id, cfg, fetchImpl)).toMatchObject({ ok: true });
  expect(await run(accountA, job.id, cfg, fetchImpl)).toMatchObject({ ok: false });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("the server action accepts the assisted method and hands confirmation through as the only change", async () => {
  const id = await userId(accountA);
  const description = "Requirements:\n- Grant credit for Excel.\n- Experience with PostgreSQL";
  const requirements = [
    { text: "Grant credit for Excel.", category: "Skills", priority: "Required", source: "", confirmed: true },
    { text: "Experience with PostgreSQL", category: "Experience", priority: "Required", source: "" },
  ];
  const job = await prisma.savedJob.create({
    data: { userId: id, title: "Analyst", company: "Imaginary Ledger", description, reviewedDescription: description, reviewVersion: 1, requirements },
  });
  const { fetchImpl, requests } = fakeAssisted();
  await run(accountA, job.id, config([id]), fetchImpl);
  expect(requests[0].requirements.map(r => r.confirmed)).toEqual([true, undefined]);
  signIn(accountA);
  const form = new FormData();
  form.set("jobId", job.id);
  form.set("provider", "assisted");
  // No local AI is configured in the test environment, so the action reaches the gate, not the method check.
  expect(await runJobMatch({}, form)).not.toEqual({ error: "Choose an analysis method." });
});
