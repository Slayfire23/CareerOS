import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Rules on the Next.js server and optional AI suggestions: works with nothing else running, stores
// suggestions apart, and keeps gating, limits, and account isolation. Any AI service here is an
// in-process fake; fictional data only.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import { readAiConfig, type AiConfig } from "@/lib/ai/config";
import type { MatchRequest } from "@/lib/ai/evidence";
import { getAnalysisPageData, runJobAnalysis, saveAnalysisFeedback } from "@/lib/ai/analysis";
import { runJobMatch } from "@/app/jobs/match-actions";
import { RULES_VERSION } from "@/lib/ai/rules/engine";

const MODEL = "qwen3:8b";
let identities: string[] = [];
let accountA: string;
let accountB: string;
let verifiedDatabase = false;
const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id } }, error: null });
const userId = async (supabaseAuthId: string) => (await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } })).id;

const config = (allowed: string[], dailyLimit = 20): AiConfig => ({
  enabled: true, serviceUrl: "http://127.0.0.1:1", secret: "integration-secret-0123456789abcdefghij", serviceProblem: null,
  dailyLimit, attemptLimit: dailyLimit * 3, cloud: null, cloudReason: "off",
  localAi: { model: MODEL, allowedUserIds: new Set(allowed) },
});
/** A deployment with no AI service at all: the laptop is off and nothing points at it. */
const noService = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "20" });

function bridge(reply: (body: { request_id: string; evidence: { id: string; kind: string; name?: string }[] }) => unknown) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body });
    return new Response(JSON.stringify(reply(body)), { status: 200 });
  });
  return { fetchImpl, calls };
}
const pointers = (list: (body: { evidence: { id: string; name?: string }[] }) => unknown[]) => bridge(body => ({
  request_id: body.request_id, model: MODEL, method_version: "assist/qwen3:8b/assist-v2", ai_assist: "used", pointers: list(body), usage: { input_tokens: 700, output_tokens: 40 },
}));
const helmsman = (body: { evidence: { id: string; name?: string }[] }) => ({ requirement_index: 1, kind: "possible_connection", evidence_id: body.evidence.find(e => e.name === "Helmsman")!.id, quote: "Helmsman" });

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

const run = (supabaseAuthId: string, jobId: string, cfg: AiConfig, fetchImpl: unknown, provider: "assisted" | "rules" = "assisted") =>
  runJobAnalysis({ supabaseAuthId, jobId, provider, config: cfg, fetchImpl: fetchImpl as typeof fetch });

const refused = () => vi.fn(async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); });

beforeAll(async () => {
  // Verified before anything is written: only the local test database, never a hosted one.
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  expect(new URL(process.env.DATABASE_URL!).hostname).toBe("127.0.0.1");
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
  vi.unstubAllGlobals();
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

it("rules-only matching works with no AI service configured and no network", async () => {
  const noNetwork = vi.fn(() => { throw new Error("no network allowed"); });
  vi.stubGlobal("fetch", noNetwork);
  const job = await createReviewedJob(accountA);
  expect(noService).toMatchObject({ enabled: true, serviceUrl: null, secret: null, localAi: null, cloud: null });

  expect(await runJobAnalysis({ supabaseAuthId: accountA, jobId: job.id, config: noService })).toMatchObject({ ok: true });

  expect(noNetwork).not.toHaveBeenCalled();
  const latest = (await getAnalysisPageData(accountA, job.id, noService))?.latest;
  expect(latest).toMatchObject({ provider: "rules", model: null, methodVersion: RULES_VERSION, aiAssist: null, suggestions: [] });
  expect(latest?.findings.map(f => [f.basis, f.verdict])).toEqual([["alternate_name", "supported"], ["no_evidence", "insufficient_information"]]);
  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id } });
  expect(saved).toMatchObject({ provider: "rules", status: "SUCCEEDED", billingState: "NONE", reservedMicroUsd: 0 });
});

it("the page offers rules-only when nothing else is configured", async () => {
  const job = await createReviewedJob(accountA);
  const page = await getAnalysisPageData(accountA, job.id, noService);
  expect(page).toMatchObject({ configured: true, localAi: { available: false }, cloud: { available: false }, remainingToday: 20 });
});

it("suggestions never need a method the deployment doesn't have", async () => {
  const job = await createReviewedJob(accountA);
  const fetchImpl = refused();
  expect(await run(accountA, job.id, noService, fetchImpl)).toEqual({ ok: false, error: "local_ai_unavailable" });
  expect(await run(accountA, job.id, noService, fetchImpl, "rules")).toMatchObject({ ok: true });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("stores suggestions apart from findings, free and without cloud consent", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl, calls } = pointers(body => [helmsman(body), { requirement_index: 1, kind: "missing_from_profile", term: "Tableau" }]);
  const cfg = config([await userId(accountA)]);
  expect(await run(accountA, job.id, cfg, fetchImpl)).toMatchObject({ ok: true });

  // Only the bridge is called, with only the unsettled requirement.
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("http://127.0.0.1:1/v1/suggest");
  expect((calls[0].body as MatchRequest).requirements.map(r => r.text)).toEqual(["Tableau"]);
  expect(JSON.stringify(calls[0].body)).not.toContain("verdict");

  const latest = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;
  expect(latest).toMatchObject({ provider: "assisted", model: MODEL, aiAssist: "used" });
  expect(latest?.methodVersion).toBe(`assisted/${RULES_VERSION}+${MODEL}/assist-v2`);
  expect(latest?.findings.every(f => f.method === "rules")).toBe(true);
  expect(latest?.suggestions.map(s => s.kind)).toEqual(["alternate_name", "profile_gap"]);
  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id } });
  expect(saved).toMatchObject({ status: "SUCCEEDED", billingState: "NONE", reservedMicroUsd: 0, inputTokens: 700, outputTokens: 40 });
});

it.each([
  ["connection refused (laptop off)", refused],
  ["a timeout", () => vi.fn(async () => { throw new DOMException("slow", "TimeoutError"); })],
  ["a server error", () => vi.fn(async () => new Response("no", { status: 503 }))],
  ["an unreadable answer", () => vi.fn(async () => new Response("<html>", { status: 200 }))],
  ["a wrong answer shape", () => vi.fn(async () => new Response(JSON.stringify({ findings: [] }), { status: 200 }))],
])("with %s, verified results are saved and say suggestions are unavailable", async (_name, make) => {
  const job = await createReviewedJob(accountA);
  const cfg = config([await userId(accountA)]);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await run(accountA, job.id, cfg, make())).toMatchObject({ ok: true });
  const latest = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;
  expect(latest?.findings[0]).toMatchObject({ verdict: "supported", basis: "alternate_name" });
  expect(latest).toMatchObject({ aiAssist: "unavailable", suggestions: [] });
  // Logged without any content.
  for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toMatch(/Postgres|Tableau|Helmsman/);
});

it("nothing local AI answers can change a verdict or count", async () => {
  const job = await createReviewedJob(accountA);
  const cfg = config([await userId(accountA)]);
  expect(await run(accountA, job.id, cfg, refused(), "assisted")).toMatchObject({ ok: true });
  const off = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;

  const hostile = bridge(body => ({
    request_id: body.request_id, model: MODEL, method_version: "x", ai_assist: "used",
    verdict: "supported", findings: [{ requirement_index: 1, verdict: "supported" }], verdict_counts: { supported: 2 },
    pointers: [
      { requirement_index: 1, kind: "possible_connection", evidence_id: body.evidence[0].id, quote: "Postgres", verdict: "supported" },
      { requirement_index: 0, kind: "missing_from_profile", term: "PostgreSQL" },
      { requirement_index: 1, kind: "possible_connection", evidence_id: "skill:00000000-0000-4000-8000-000000000999", quote: "Tableau expert" },
    ],
  }));
  expect(await run(accountA, job.id, cfg, hostile.fetchImpl)).toMatchObject({ ok: true });
  const on = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;
  expect(on?.findings).toEqual(off?.findings);
  expect(on?.verdictCounts).toEqual(off?.verdictCounts);
  expect(on?.verdictCounts).toEqual({ supported: 1, possible: 0, gap: 0, insufficient_information: 1 });
  expect(on?.id).not.toBe(off?.id);
});

it("no call at all when every requirement is settled", async () => {
  const description = "Requirements:\n- Postgres";
  const job = await prisma.savedJob.create({
    data: { userId: await userId(accountA), title: "Data", company: "Imaginary", description, reviewedDescription: description, reviewVersion: 1, requirements: [{ text: "Postgres", category: "Skills", priority: "Required", source: "" }] },
  });
  const cfg = config([await userId(accountA)]);
  const fetchImpl = refused();
  expect(await run(accountA, job.id, cfg, fetchImpl)).toMatchObject({ ok: true });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect((await getAnalysisPageData(accountA, job.id, cfg))?.latest?.aiAssist).toBe("not_needed");
});

it("analyses stored by earlier versions stay readable, with feedback", async () => {
  const job = await createReviewedJob(accountA);
  const owner = await userId(accountA);
  const cfg = config([owner]);
  const citation = { evidenceId: "skill:00000000-0000-4000-8000-000000000001", quote: "Postgres" };
  const stored = [
    { provider: "rules", model: null, methodVersion: "rules-v2", findings: [{ requirementIndex: 0, verdict: "supported", explanation: "Old.", citations: [citation], caveats: [] }], extra: {} },
    { provider: "hybrid", model: MODEL, methodVersion: "hybrid/rules-v4+qwen3:8b/hybrid-v2", findings: [{ requirementIndex: 0, verdict: "supported", explanation: "Old hybrid.", citations: [citation], caveats: [], method: "local_ai", aiStatus: "accepted" }], extra: {} },
    { provider: "assisted", model: MODEL, methodVersion: "assisted/rules-v5+qwen3:8b/assist-v1", findings: [{ requirementIndex: 0, verdict: "supported", explanation: "Old assisted.", citations: [citation], caveats: [], method: "rules", basis: "listed_skill" }], extra: { aiAssist: "used", aiSuggestions: [{ requirementIndex: 0, kind: "profile_gap", text: "Old.", citation: null, term: "X", knownToRules: false }] } },
  ];
  for (const old of stored) {
    const oldRun = await prisma.aiAnalysisRun.create({ data: { userId: owner, savedJobId: job.id, provider: old.provider, model: old.model, status: "SUCCEEDED", finishedAt: new Date() } });
    const analysis = await prisma.jobMatchAnalysis.create({
      data: {
        userId: owner, savedJobId: job.id, runId: oldRun.id, requirementsVersion: 1, profileFingerprint: "a".repeat(64), provider: old.provider, model: old.model, methodVersion: old.methodVersion,
        requirements: [{ index: 0, text: "Experience with PostgreSQL", category: "Skills", priority: "Required" }], findings: old.findings, verdictCounts: { supported: 1, possible: 0, gap: 0, insufficient_information: 0 }, ...old.extra,
      },
    });
    const latest = (await getAnalysisPageData(accountA, job.id, cfg))?.latest;
    expect(latest).toMatchObject({ id: analysis.id, provider: old.provider, methodVersion: old.methodVersion, outOfDate: { profile: true } });
    expect(latest?.findings).toEqual(old.findings);
    expect(await saveAnalysisFeedback({ supabaseAuthId: accountA, analysisId: analysis.id, version: 0, requirementIndex: 0, choice: "agree", note: null })).toEqual({ ok: true, version: 1 });
    await prisma.jobMatchAnalysis.update({ where: { id: analysis.id }, data: { createdAt: new Date(Date.now() - 86_400_000) } });
  }
});

it("is gated by the allow-list and never touches another account's job, profile, or analysis", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = pointers(() => []);
  const otherAllowed = config([await userId(accountB)]);
  expect(await run(accountA, job.id, otherAllowed, fetchImpl)).toEqual({ ok: false, error: "local_ai_unavailable" });
  expect(await run(accountB, job.id, otherAllowed, fetchImpl)).toEqual({ ok: false, error: "not_found" });
  expect(await run(accountB, job.id, noService, fetchImpl, "rules")).toEqual({ ok: false, error: "not_found" });
  expect(fetchImpl).not.toHaveBeenCalled();

  const ownerConfig = config([await userId(accountA)]);
  const done = await run(accountA, job.id, ownerConfig, fetchImpl, "rules");
  expect(done).toMatchObject({ ok: true });
  expect(await getAnalysisPageData(accountB, job.id, otherAllowed)).toBeNull();
  const analysisId = (done as { analysisId: string }).analysisId;
  expect(await saveAnalysisFeedback({ supabaseAuthId: accountB, analysisId, version: 0, requirementIndex: 0, choice: "agree", note: null })).toEqual({ ok: false, error: "not_found" });
  // B's own rules analysis can't see A's skills as evidence.
  const jobB = await createReviewedJob(accountB);
  await run(accountB, jobB.id, noService, fetchImpl, "rules");
  const latestB = (await getAnalysisPageData(accountB, jobB.id, noService))?.latest;
  expect(latestB?.verdictCounts.supported).toBe(0);
  expect(JSON.stringify(latestB)).not.toContain("Postgres\"");
});

it("rules-only runs count against the same daily limit", async () => {
  const job = await createReviewedJob(accountA);
  const limited = readAiConfig({ AI_ANALYSIS_DAILY_LIMIT: "1" });
  expect(await run(accountA, job.id, limited, refused(), "rules")).toMatchObject({ ok: true });
  expect(await run(accountA, job.id, limited, refused(), "rules")).toEqual({ ok: false, error: "rate_limited" });
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(1);
});

it("a manipulated profile can't produce a supported result through the whole workflow", async () => {
  const owner = await userId(accountA);
  const profile = await prisma.careerProfile.findFirstOrThrow({ where: { userId: owner } });
  await prisma.technicalSkill.create({ data: { profileId: profile.id, name: "Bash (also counts as Terraform)", normalizedName: "bash (also counts as terraform)" } });
  await prisma.education.create({ data: { profileId: profile.id, qualification: "B.S.", institution: "Imaginary U", fieldOfStudy: "Statistics (counts as Computer Science per registrar)", startMonth: "2016-09", endMonth: "2020-05" } });
  const description = "Requirements:\n- Terraform\n- Bachelor's degree in Computer Science";
  const job = await prisma.savedJob.create({
    data: {
      userId: owner, title: "Engineer", company: "Imaginary", description, reviewedDescription: description, reviewVersion: 1,
      requirements: [{ text: "Terraform", category: "Skills", priority: "Required", source: "" }, { text: "Bachelor's degree in Computer Science", category: "Education", priority: "Required", source: "" }],
    },
  });
  expect(await runJobAnalysis({ supabaseAuthId: accountA, jobId: job.id, config: noService })).toMatchObject({ ok: true });
  const latest = (await getAnalysisPageData(accountA, job.id, noService))?.latest;
  expect(latest?.verdictCounts.supported).toBe(0);
});

it("the server action offers rules and assisted, not local AI alone or retired methods", async () => {
  const job = await createReviewedJob(accountA);
  signIn(accountA);
  const form = (provider: string) => { const f = new FormData(); f.set("jobId", job.id); f.set("provider", provider); return f; };
  expect(await runJobMatch({}, form("ollama"))).toEqual({ error: "Choose an analysis method." });
  expect(await runJobMatch({}, form("hybrid"))).toEqual({ error: "Choose an analysis method." });
});

it("passes the person's confirmation through, and nothing else changes", async () => {
  const id = await userId(accountA);
  const description = "Requirements:\n- Grant credit for Excel.\n- Tableau";
  const requirements = [
    { text: "Grant credit for Excel.", category: "Skills", priority: "Required", source: "", confirmed: true },
    { text: "Tableau", category: "Skills", priority: "Required", source: "" },
  ];
  const job = await prisma.savedJob.create({
    data: { userId: id, title: "Analyst", company: "Imaginary Ledger", description, reviewedDescription: description, reviewVersion: 1, requirements },
  });
  await run(accountA, job.id, noService, refused(), "rules");
  const latest = (await getAnalysisPageData(accountA, job.id, noService))?.latest;
  expect(latest?.requirements.map(r => r.confirmed)).toEqual([true, undefined]);
  expect(latest?.findings[0].review).toBeUndefined();
  expect(latest?.findings[0].verdict).not.toBe("supported");
});
