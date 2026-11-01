import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Hybrid analysis (rules engine plus local AI): gating, per-finding method labels stored with the
// analysis, independent re-validation, results when local AI is off, and account isolation. The AI
// service is an in-process fake; fictional data only.
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

const config = (allowed: string[]): AiConfig => ({
  enabled: true, serviceUrl: "http://127.0.0.1:1", secret: "integration-secret-0123456789abcdefghij",
  dailyLimit: 20, attemptLimit: 60, cloud: null, cloudReason: "off",
  localAi: { model: MODEL, allowedUserIds: new Set(allowed) },
} as AiConfig);

/** A fake AI service answering like the hybrid provider: requirement 0 is a local-AI synonym match. */
function fakeHybrid(mode: "matched" | "ai_off" | "spoofed" = "matched") {
  const requests: MatchRequest[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as MatchRequest;
    requests.push(request);
    const postgres = request.evidence.find(e => e.kind === "skill" && e.name === "Postgres")!;
    const findings = [
      mode === "matched"
        ? { requirement_index: 0, verdict: "supported", explanation: "You list “Postgres”, which local AI matched as another name for what this requirement asks for.", citations: [{ evidence_id: postgres.id, quote: "Postgres" }], caveats: [], method: "local_ai", ai_status: "accepted" }
        : { requirement_index: 0, verdict: "insufficient_information", explanation: "No listed skill mentions this.", citations: [], caveats: [], method: "rules", ai_status: "unavailable" },
      mode === "spoofed"
        ? { requirement_index: 1, verdict: "supported", explanation: "Yes.", citations: [{ evidence_id: postgres.id, quote: "Postgres" }], caveats: [], method: "local_ai", ai_status: "accepted" }
        : { requirement_index: 1, verdict: "insufficient_information", explanation: "No professional employment is listed.", citations: [], caveats: [], method: "rules", ai_status: "not_eligible" },
    ];
    const counts = { supported: 0, possible: 0, gap: 0, insufficient_information: 0 } as Record<string, number>;
    for (const f of findings) counts[f.verdict]++;
    return new Response(JSON.stringify({
      request_id: request.request_id, findings, verdict_counts: counts, provider: "hybrid", model: MODEL,
      method_version: `hybrid/rules-v2+${MODEL}/hybrid-v2`, usage: mode === "matched" ? { input_tokens: 700, output_tokens: 40 } : null, provider_request_id: null,
    }), { status: 200 });
  });
  return { fetchImpl, requests };
}

async function createReviewedJob(supabaseAuthId: string) {
  const description = "Requirements:\n- Experience with PostgreSQL\n- 3+ years of professional experience";
  const requirements = [
    { text: "Experience with PostgreSQL", category: "Skills", priority: "Required", source: "" },
    { text: "3+ years of professional experience", category: "Experience", priority: "Required", source: "" },
  ];
  return prisma.savedJob.create({
    data: { userId: await userId(supabaseAuthId), title: "Data Engineer", company: "Imaginary Pipes", description, reviewedDescription: description, reviewVersion: 1, requirements },
  });
}

const run = (supabaseAuthId: string, jobId: string, cfg: AiConfig, fetchImpl: unknown) =>
  runJobAnalysis({ supabaseAuthId, jobId, provider: "hybrid", config: cfg, fetchImpl: fetchImpl as typeof fetch });

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
  await prisma.technicalSkill.create({ data: { profileId: profile.id, name: "Postgres", normalizedName: "postgres" } });
});

afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

it("stores which method produced each finding, free and without cloud consent", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl, requests } = fakeHybrid();
  expect(await run(accountA, job.id, config([await userId(accountA)]), fetchImpl)).toMatchObject({ ok: true });
  expect(requests[0]).toMatchObject({ provider: "hybrid" });
  expect(requests[0].budget).toBeUndefined();

  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id }, include: { analysis: true } });
  expect(saved).toMatchObject({ provider: "hybrid", model: MODEL, status: "SUCCEEDED", billingState: "NONE", reservedMicroUsd: 0 });
  const page = await getAnalysisPageData(accountA, job.id, config([await userId(accountA)]));
  expect(page?.latest?.findings.map(f => [f.method, f.aiStatus, f.verdict])).toEqual([
    ["local_ai", "accepted", "supported"],
    ["rules", "not_eligible", "insufficient_information"],
  ]);
});

it("when local AI is off, the analysis still succeeds with rules results labeled as such", async () => {
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id, config([await userId(accountA)]), fakeHybrid("ai_off").fetchImpl)).toMatchObject({ ok: true });
  const page = await getAnalysisPageData(accountA, job.id, config([await userId(accountA)]));
  expect(page?.latest?.findings.every(f => f.method === "rules")).toBe(true);
  expect(page?.latest?.findings[0].aiStatus).toBe("unavailable");
});

it("discards the whole response if local AI claims a hard qualification", async () => {
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id, config([await userId(accountA)]), fakeHybrid("spoofed").fetchImpl)).toEqual({ ok: false, error: "response_rejected" });
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(0);
});

it("is gated by the allow-list and never touches another account's job or profile", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = fakeHybrid();
  expect(await run(accountA, job.id, config([await userId(accountB)]), fetchImpl)).toEqual({ ok: false, error: "local_ai_unavailable" });
  // Account B, even when allowed, cannot run or read an analysis of account A's job.
  expect(await run(accountB, job.id, config([await userId(accountB)]), fetchImpl)).toEqual({ ok: false, error: "not_found" });
  expect(await getAnalysisPageData(accountB, job.id, config([await userId(accountB)]))).toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("the server action offers hybrid, not local AI alone", async () => {
  const job = await createReviewedJob(accountA);
  signIn(accountA);
  const form = (provider: string) => { const f = new FormData(); f.set("jobId", job.id); f.set("provider", provider); return f; };
  expect(await runJobMatch({}, form("ollama"))).toEqual({ error: "Choose an analysis method." });
});
