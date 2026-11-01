import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Local AI (Ollama on CareerOS-controlled hardware): gating, no cost ledger, no redaction, strict
// validation, and graceful failure when the computer running it is off. The AI service is an
// in-process fake; fictional data only.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import type { AiConfig } from "@/lib/ai/config";
import type { MatchRequest } from "@/lib/ai/evidence";
import { getAnalysisPageData, runJobAnalysis } from "@/lib/ai/analysis";

const MODEL = "qwen3:8b";
let identities: string[] = [];
let accountA: string;
let accountB: string;
let verifiedDatabase = false;
const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
const userId = async (supabaseAuthId: string) => (await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } })).id;

const config = (allowed: string[], overrides: Partial<AiConfig> = {}): AiConfig => ({
  enabled: true, serviceUrl: "http://127.0.0.1:1", secret: "integration-secret-0123456789abcdefghij",
  dailyLimit: 20, attemptLimit: 60, cloud: null, cloudReason: "off",
  localAi: { model: MODEL, allowedUserIds: new Set(allowed) },
  ...overrides,
} as AiConfig);

function fakeService(overrides: (request: MatchRequest, body: Record<string, unknown>) => void = () => {}) {
  const requests: MatchRequest[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string) as MatchRequest;
    requests.push(request);
    const findings = request.requirements.map(r => {
      const skill = request.evidence.find(e => e.kind === "skill" && r.text.includes(e.name));
      return skill && skill.kind === "skill"
        ? { requirement_index: r.index, verdict: "supported", explanation: `You list ${skill.name} as a skill.`, citations: [{ evidence_id: skill.id, quote: skill.name }], caveats: [] }
        : { requirement_index: r.index, verdict: "insufficient_information", explanation: "Nothing found.", citations: [], caveats: [] };
    });
    const counts = { supported: 0, possible: 0, gap: 0, insufficient_information: 0 } as Record<string, number>;
    for (const f of findings) counts[f.verdict]++;
    const body: Record<string, unknown> = {
      request_id: request.request_id, findings, verdict_counts: counts, provider: request.provider, model: MODEL,
      method_version: `ollama/${MODEL}/prompt-v1`, usage: { input_tokens: 820, output_tokens: 160 }, provider_request_id: null,
    };
    overrides(request, body);
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetchImpl, requests };
}

async function createReviewedJob(supabaseAuthId: string) {
  const description = "Requirements:\n- Proficiency in SolidWorks";
  const requirements = [{ text: "Proficiency in SolidWorks", category: "Skills", priority: "Required", source: "" }];
  return prisma.savedJob.create({
    data: { userId: await userId(supabaseAuthId), title: "Engineer", company: "Imaginary Gadgets", description, reviewedDescription: description, reviewVersion: 1, requirements },
  });
}

const run = (supabaseAuthId: string, jobId: string, cfg: AiConfig, fetchImpl: unknown) =>
  runJobAnalysis({ supabaseAuthId, jobId, provider: "ollama", config: cfg, fetchImpl: fetchImpl as typeof fetch });

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
  await prisma.technicalSkill.create({ data: { profileId: profile.id, name: "SolidWorks", normalizedName: "solidworks" } });
});

afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

it("runs a free, strictly validated local analysis for an allow-listed account, with no cloud consent", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl, requests } = fakeService();
  expect(await run(accountA, job.id, config([await userId(accountA)]), fetchImpl)).toMatchObject({ ok: true });

  expect(requests[0]).toMatchObject({ provider: "ollama" });
  expect(requests[0].budget).toBeUndefined(); // no cost reservation
  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id }, include: { analysis: true } });
  expect(saved).toMatchObject({
    provider: "ollama", model: MODEL, status: "SUCCEEDED", billingState: "NONE", reservedMicroUsd: 0, confirmedMicroUsd: null,
    inputTokens: 820, outputTokens: 160, countsTowardLimit: true,
  });
  expect(saved.analysis).toMatchObject({ provider: "ollama", model: MODEL, methodVersion: `ollama/${MODEL}/prompt-v1` });
  expect((await getAnalysisPageData(accountA, job.id, config([await userId(accountA)])))?.localAi).toEqual({ available: true, model: MODEL });
});

it("is unavailable when turned off or for accounts not on the allow-list, without calling the service", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = fakeService();
  expect(await run(accountA, job.id, config([await userId(accountB)]), fetchImpl)).toEqual({ ok: false, error: "local_ai_unavailable" });
  expect(await run(accountA, job.id, config([], { localAi: null }), fetchImpl)).toEqual({ ok: false, error: "local_ai_unavailable" });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: job.id } })).toBe(0);
  expect((await getAnalysisPageData(accountA, job.id, config([], { localAi: null })))?.localAi).toEqual({ available: false, model: null });
});

it("rejects a response from a different model or with overreaching findings", async () => {
  const job = await createReviewedJob(accountA);
  const cfg = config([await userId(accountA)]);
  expect(await run(accountA, job.id, cfg, fakeService((_r, body) => { body.model = "qwen3.5:9b"; }).fetchImpl)).toEqual({ ok: false, error: "response_rejected" });
  expect(await run(accountA, job.id, cfg, fakeService((_r, body) => {
    (body.findings as { citations: { quote: string }[] }[])[0].citations[0].quote = "SolidWorks guru";
  }).fetchImpl)).toEqual({ ok: false, error: "response_rejected" });
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(0);
  const runs = await prisma.aiAnalysisRun.findMany({ where: { savedJobId: job.id } });
  expect(runs.every(r => r.billingState === "NONE" && r.status === "FAILED")).toBe(true);
});

it("when the AI computer is off, the run fails cleanly, uses no daily allowance, and the rules engine still works", async () => {
  const job = await createReviewedJob(accountA);
  const cfg = config([await userId(accountA)]);
  const off = vi.fn(async () => new Response(JSON.stringify({ error: { code: "provider_unavailable", message: "x", billed: "no", usage: null, provider_request_id: null } }), { status: 503 }));
  expect(await run(accountA, job.id, cfg, off)).toEqual({ ok: false, error: "provider_unavailable" });
  expect(await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id } })).toMatchObject({ billingState: "NONE", countsTowardLimit: false });
  expect((await getAnalysisPageData(accountA, job.id, cfg))?.remainingToday).toBe(20);

  const rules = await runJobAnalysis({ supabaseAuthId: accountA, jobId: job.id, provider: "rules", config: cfg, fetchImpl: fakeService((r, body) => {
    body.provider = "rules"; body.model = null; body.method_version = "rules-v3"; body.usage = null;
  }).fetchImpl as unknown as typeof fetch });
  expect(rules).toMatchObject({ ok: true });
});
