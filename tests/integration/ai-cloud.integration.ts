import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL } from "../support/local-database";

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: auth.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));

// Phase 3: cloud provider gating, consent, redaction, failed-run limits, and the cost ledger.
// Real application code and Prisma against the local test database. The AI service is an
// in-process fake: no network, no AI provider, and every person, company, and school is fictional.
import { prisma } from "@/lib/db";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import type { AiConfig, CloudConfig } from "@/lib/ai/config";
import type { MatchRequest } from "@/lib/ai/evidence";
import { costMicroUsd } from "@/lib/ai/pricing";
import { getAnalysisPageData, reconcileUnresolvedRun, runJobAnalysis, setCloudAiConsent, STALE_RUN_MS } from "@/lib/ai/analysis";

const USD = 1_000_000;
const MODEL = "claude-sonnet-5-5";
const USAGE = { input_tokens: 3000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const FICTIONAL = {
  name: "Avery Quillfeather",
  company: "Contoso Fictional Labs",
  school: "Fictional State Polytechnic",
  employer: "Northwind Imaginary Devices",
  email: "avery.quill@example.test",
};

let identities: string[] = [];
let accountA: string;
let accountB: string;
let verifiedDatabase = false;

const signIn = (id: string) => auth.getUser.mockResolvedValue({ data: { user: { id, email: FICTIONAL.email } }, error: null });
const userId = async (supabaseAuthId: string) => (await prisma.user.findUniqueOrThrow({ where: { supabaseAuthId } })).id;

function cloudConfig(allowed: string[], limits: Partial<CloudConfig> = {}, base: Partial<AiConfig> = {}): AiConfig {
  return {
    enabled: true,
    serviceUrl: "http://127.0.0.1:1",
    secret: "integration-secret-0123456789abcdefghij",
    dailyLimit: 20,
    attemptLimit: 60,
    cloudReason: null,
    cloud: {
      provider: "anthropic",
      model: MODEL,
      userDailyMicroUsd: 1 * USD,
      globalDailyMicroUsd: 3 * USD,
      globalMonthlyMicroUsd: 25 * USD,
      allowedUserIds: new Set(allowed),
      ...limits,
    },
    ...base,
  } as AiConfig;
}

/** Fake AI service: finds a listed skill when the requirement names it, and reports usage. */
function fakeCloud(overrides: (request: MatchRequest, body: Record<string, unknown>) => void = () => {}) {
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
    const isCloud = request.provider === "anthropic";
    const body: Record<string, unknown> = {
      request_id: request.request_id, findings, verdict_counts: counts, provider: request.provider,
      model: isCloud ? MODEL : null, method_version: isCloud ? `${MODEL}/prompt-v1` : "rules-v1",
      usage: isCloud ? USAGE : null, provider_request_id: isCloud ? "req_fictional_ok" : null,
    };
    overrides(request, body);
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetchImpl, requests };
}

function serviceError(status: number, code: string, billed: string, usage: object | null = null) {
  return vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "fictional", billed, usage, provider_request_id: "req_fictional_err" } }), { status }));
}

const refused = () => vi.fn(async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }); });

async function prepareProfile(supabaseAuthId: string) {
  const profile = await prisma.careerProfile.findFirstOrThrow({ where: { user: { supabaseAuthId } } });
  await prisma.careerProfile.update({ where: { id: profile.id }, data: { displayName: FICTIONAL.name } });
  await prisma.technicalSkill.create({ data: { profileId: profile.id, name: "SolidWorks", normalizedName: "solidworks" } });
  await prisma.professionalExperience.create({
    data: {
      profileId: profile.id, jobTitle: "Mechanical Engineer", company: FICTIONAL.company, startMonth: "2023-06",
      description: `At ${FICTIONAL.company} I worked with avery quillfeather's team. Reach me at ${FICTIONAL.email}, +1 (555) 010-4477, or https://example.test/avery. Built fixtures in 2019-2023.`,
    },
  });
  await prisma.education.create({
    data: { profileId: profile.id, qualification: "B.S.", institution: FICTIONAL.school, fieldOfStudy: "Mechanical Engineering", startMonth: "2019-08", endMonth: "2023-05", description: `Graduated from ${FICTIONAL.school}.` },
  });
}

async function createReviewedJob(supabaseAuthId: string) {
  const description = `Requirements:\n- Proficiency in SolidWorks\n- Experience shipping products at ${FICTIONAL.employer}`;
  const requirements = [
    { text: "Proficiency in SolidWorks", category: "Skills", priority: "Required", source: "" },
    { text: `Experience shipping products at ${FICTIONAL.employer}`, category: "Experience", priority: "Preferred", source: "" },
  ];
  return prisma.savedJob.create({
    data: { userId: await userId(supabaseAuthId), title: "Engineer", company: FICTIONAL.employer, description, reviewedDescription: description, reviewVersion: 1, requirements },
  });
}

const run = (supabaseAuthId: string, jobId: string, config: AiConfig, fetchImpl: unknown, provider: "rules" | "anthropic" = "anthropic", now?: Date) =>
  runJobAnalysis({ supabaseAuthId, jobId, provider, config, contactEmail: FICTIONAL.email, fetchImpl: fetchImpl as typeof fetch, now });

async function newAccount() {
  const id = randomUUID();
  identities.push(id);
  signIn(id);
  await ensureCurrentUserProfile();
  await prepareProfile(id);
  await setCloudAiConsent(id, true);
  return id;
}

beforeAll(async () => {
  expect(process.env.DATABASE_URL).toBe(TEST_DATABASE_URL);
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  expect(rows).toEqual([{ name: "careeros_test" }]);
  verifiedDatabase = true;
});

beforeEach(async () => {
  if (!verifiedDatabase) throw new Error("Local test database verification failed.");
  identities = [];
  accountA = randomUUID();
  accountB = randomUUID();
  for (const id of [accountA, accountB]) {
    identities.push(id);
    signIn(id);
    await ensureCurrentUserProfile();
    await prepareProfile(id);
  }
});

afterEach(async () => {
  if (verifiedDatabase && identities.length) await prisma.user.deleteMany({ where: { supabaseAuthId: { in: identities } } });
  identities = [];
});

afterAll(async () => { await prisma.$disconnect(); });

// --- Gating and consent ---------------------------------------------------------------------------

it("requires an allow-listed account, full configuration, and current versioned consent before any call", async () => {
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = fakeCloud();
  const config = cloudConfig([await userId(accountA)]);

  expect(await run(accountA, job.id, config, fetchImpl)).toEqual({ ok: false, error: "consent_required" });
  await setCloudAiConsent(accountA, true);
  await prisma.user.update({ where: { supabaseAuthId: accountA }, data: { aiCloudConsentVersion: 99 } }); // older or other text
  expect(await run(accountA, job.id, config, fetchImpl)).toEqual({ ok: false, error: "consent_required" });
  await setCloudAiConsent(accountA, true);
  expect(await run(accountA, job.id, cloudConfig([await userId(accountB)]), fetchImpl)).toEqual({ ok: false, error: "cloud_unavailable" });
  expect(await run(accountA, job.id, { ...config, cloud: null, cloudReason: "off" } as AiConfig, fetchImpl)).toEqual({ ok: false, error: "cloud_unavailable" });
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: job.id } })).toBe(0);

  expect(await run(accountA, job.id, config, fetchImpl)).toMatchObject({ ok: true });
  await setCloudAiConsent(accountA, false);
  expect(await run(accountA, job.id, config, fetchImpl)).toEqual({ ok: false, error: "consent_required" });
  // The rules engine stays a separate choice that never needs consent.
  expect(await run(accountA, job.id, config, fetchImpl, "rules")).toMatchObject({ ok: true });

  const page = await getAnalysisPageData(accountA, job.id, config);
  expect(page?.cloud).toEqual({ available: true, consentCurrent: false });
  expect((await getAnalysisPageData(accountB, (await createReviewedJob(accountB)).id, config))?.cloud).toEqual({ available: false, consentCurrent: false });
});

it("sends only redacted, minimized data with a token budget, and confirms the charge from reported usage", async () => {
  await setCloudAiConsent(accountA, true);
  const job = await createReviewedJob(accountA);
  const { fetchImpl, requests } = fakeCloud();
  expect(await run(accountA, job.id, cloudConfig([await userId(accountA)]), fetchImpl)).toMatchObject({ ok: true });

  const sent = JSON.stringify(requests[0]);
  for (const secret of [FICTIONAL.name, "Avery", "Quillfeather", "quillfeather", FICTIONAL.company, FICTIONAL.school, FICTIONAL.employer, FICTIONAL.email, "555", "https://"]) {
    expect(sent).not.toContain(secret);
  }
  for (const placeholder of ["[company]", "[school]", "[employer]", "[email]", "[phone]", "[link]", "[name]"]) expect(sent).toContain(placeholder);
  expect(sent).toContain("2019-2023"); // dates survive phone redaction
  expect(requests[0].budget).toEqual({ max_input_tokens: expect.any(Number), max_output_tokens: 6000 });
  const withoutBudget = { ...requests[0], budget: undefined }; // JSON.stringify drops undefined fields
  expect(requests[0].budget!.max_input_tokens).toBe(Buffer.byteLength(JSON.stringify(withoutBudget), "utf8") + 12_000);

  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id }, include: { analysis: true } });
  expect(saved).toMatchObject({
    status: "SUCCEEDED", provider: "anthropic", model: MODEL, billingState: "CONFIRMED",
    confirmedMicroUsd: costMicroUsd(MODEL, USAGE), inputTokens: 3000, outputTokens: 500, providerRequestId: "req_fictional_ok", countsTowardLimit: true,
  });
  expect(saved.reservedMicroUsd).toBeGreaterThan(saved.confirmedMicroUsd!);
  expect(saved.analysis).toMatchObject({ provider: "anthropic", model: MODEL, methodVersion: `${MODEL}/prompt-v1` });
  // The stored fingerprint is of the unredacted profile, so the analysis is current.
  expect((await getAnalysisPageData(accountA, job.id, cloudConfig([await userId(accountA)])))?.latest?.outOfDate).toEqual({ requirements: false, profile: false });
});

// --- Billing outcomes ---------------------------------------------------------------------------

it.each([
  ["refused by the provider (usage reported)", () => serviceError(502, "provider_refused", "yes", USAGE), "provider_refused", "CONFIRMED", true],
  ["rejected output without usage", () => serviceError(502, "provider_output_rejected", "yes"), "provider_output_rejected", "UNRESOLVED", true],
  ["timed out at the provider", () => serviceError(504, "provider_timeout", "unknown"), "provider_timeout", "UNRESOLVED", true],
  ["provider busy (not processed)", () => serviceError(503, "provider_busy", "no"), "provider_busy", "RELEASED", false],
  ["provider unavailable (not processed)", () => serviceError(503, "provider_unavailable", "no"), "provider_unavailable", "RELEASED", false],
  ["replay store down (not processed)", () => serviceError(503, "replay_store_unavailable", "no"), "replay_store_unavailable", "RELEASED", false],
  ["service refused the connection", refused, "service_unavailable", "RELEASED", false],
  ["request timed out on our side", () => vi.fn(async () => { throw new DOMException("t", "TimeoutError"); }), "service_timeout", "UNRESOLVED", true],
  ["connection reset after sending", () => vi.fn(async () => { throw new TypeError("fetch failed"); }), "service_unavailable", "UNRESOLVED", true],
])("records a cloud run %s with the right billing state", async (_label, makeFetch, error, billingState, counts) => {
  await setCloudAiConsent(accountA, true);
  const job = await createReviewedJob(accountA);
  expect(await run(accountA, job.id, cloudConfig([await userId(accountA)]), makeFetch())).toEqual({ ok: false, error });
  const saved = await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id } });
  expect(saved).toMatchObject({ status: "FAILED", errorCode: error, billingState, countsTowardLimit: counts });
  if (billingState === "CONFIRMED") expect(saved.confirmedMicroUsd).toBe(costMicroUsd(MODEL, USAGE));
  else expect(saved.confirmedMicroUsd).toBeNull(); // an estimate is never recorded as a confirmed charge
  expect(await prisma.jobMatchAnalysis.count({ where: { savedJobId: job.id } })).toBe(0);
});

it("confirms the charge for a response Next.js rejects, using the usage it reported", async () => {
  await setCloudAiConsent(accountA, true);
  const job = await createReviewedJob(accountA);
  const { fetchImpl } = fakeCloud((_r, body) => {
    (body.findings as { citations: { evidence_id: string }[] }[])[0].citations = [{ evidence_id: `skill:${randomUUID()}`, quote: "SolidWorks" } as never];
  });
  expect(await run(accountA, job.id, cloudConfig([await userId(accountA)]), fetchImpl)).toEqual({ ok: false, error: "response_rejected" });
  expect(await prisma.aiAnalysisRun.findFirstOrThrow({ where: { savedJobId: job.id } })).toMatchObject({
    billingState: "CONFIRMED", confirmedMicroUsd: costMicroUsd(MODEL, USAGE), errorCode: "response_rejected",
  });
});

// --- Budgets and reconciliation -------------------------------------------------------------------

it("holds unresolved charges against the budget until they are reconciled", async () => {
  await setCloudAiConsent(accountA, true);
  const job = await createReviewedJob(accountA);
  const config = cloudConfig([await userId(accountA)], { userDailyMicroUsd: 1 * USD });
  // A charge from three days ago that was never resolved still counts toward today's cap.
  const old = await prisma.aiAnalysisRun.create({
    data: {
      userId: await userId(accountA), provider: "anthropic", model: MODEL, status: "FAILED", errorCode: "provider_timeout",
      startedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000), finishedAt: new Date(), billingState: "UNRESOLVED", reservedMicroUsd: 950_000,
    },
  });
  const { fetchImpl } = fakeCloud();
  expect(await run(accountA, job.id, config, fetchImpl)).toEqual({ ok: false, error: "user_budget_exceeded" });
  expect(fetchImpl).not.toHaveBeenCalled();

  expect(await reconcileUnresolvedRun(old.id, { confirmedMicroUsd: 12_345 })).toBe(true);
  expect(await reconcileUnresolvedRun(old.id, { released: true })).toBe(false); // already settled
  expect(await prisma.aiAnalysisRun.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ billingState: "CONFIRMED", confirmedMicroUsd: 12_345, reconciledAt: expect.any(Date) });
  expect(await run(accountA, job.id, config, fetchImpl)).toMatchObject({ ok: true });
});

it("refuses a reservation at the global daily and monthly caps", async () => {
  await setCloudAiConsent(accountA, true);
  const job = await createReviewedJob(accountA);
  const other = await userId(accountB);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  await prisma.aiAnalysisRun.createMany({
    data: [
      // Earlier this month: counts toward the monthly cap. Last month: does not.
      { userId: other, provider: "anthropic", model: MODEL, status: "SUCCEEDED", startedAt: new Date(monthStart.getTime() + 60_000), finishedAt: new Date(), billingState: "CONFIRMED", reservedMicroUsd: 100_000, confirmedMicroUsd: 950_000 },
      { userId: other, provider: "anthropic", model: MODEL, status: "SUCCEEDED", startedAt: new Date(monthStart.getTime() - 86_400_000), finishedAt: new Date(), billingState: "CONFIRMED", reservedMicroUsd: 100_000, confirmedMicroUsd: 20 * USD },
    ],
  });
  const { fetchImpl } = fakeCloud();
  const allowed = [await userId(accountA)];
  expect(await run(accountA, job.id, cloudConfig(allowed, { globalDailyMicroUsd: 100 * USD, globalMonthlyMicroUsd: 1 * USD }), fetchImpl)).toEqual({ ok: false, error: "budget_exceeded" });
  expect(await run(accountA, job.id, cloudConfig(allowed, { globalDailyMicroUsd: 100 * USD, globalMonthlyMicroUsd: 2 * USD }), fetchImpl)).toMatchObject({ ok: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("never exceeds the global cap under 25 concurrent cloud requests from five users", async () => {
  const accounts = [accountA, accountB];
  for (let i = 0; i < 3; i++) accounts.push(await newAccount()); // sequential: sign-in is a shared mock
  await Promise.all(accounts.map(id => setCloudAiConsent(id, true)));
  const jobs = await Promise.all(accounts.map(id => createReviewedJob(id)));
  const allowed = await Promise.all(accounts.map(userId));
  const cap = Math.round(0.3 * USD);
  const config = cloudConfig(allowed, { globalDailyMicroUsd: cap, globalMonthlyMicroUsd: 25 * USD });
  // Every call ends "billed: unknown", so each reservation stays held: the worst case for the cap.
  const fetchImpl = serviceError(504, "provider_timeout", "unknown");

  const results = await Promise.all(accounts.flatMap((id, i) => Array.from({ length: 5 }, () => run(id, jobs[i].id, config, fetchImpl))));
  const runs = await prisma.aiAnalysisRun.findMany({ where: { userId: { in: allowed } } });
  const held = runs.reduce((sum, r) => sum + r.reservedMicroUsd, 0);
  expect(held).toBeLessThanOrEqual(cap);
  expect(runs.length).toBe(Math.floor(cap / runs[0].reservedMicroUsd));
  expect(results.filter(r => !r.ok && r.error === "budget_exceeded")).toHaveLength(25 - runs.length);
  expect(fetchImpl).toHaveBeenCalledTimes(runs.length);
  expect(runs.every(r => r.billingState === "UNRESOLVED")).toBe(true);
});

// --- Failed-run limits (any provider) -------------------------------------------------------------

it("does not let an outage use up the daily limit, and stops retry storms at the attempt cap", async () => {
  const job = await createReviewedJob(accountA);
  const config = cloudConfig([], {}, { dailyLimit: 2, attemptLimit: 6 });
  for (let i = 0; i < 4; i++) expect(await run(accountA, job.id, config, refused(), "rules")).toEqual({ ok: false, error: "service_unavailable" });
  expect((await getAnalysisPageData(accountA, job.id, config))?.remainingToday).toBe(2);
  const { fetchImpl } = fakeCloud();
  expect(await run(accountA, job.id, config, fetchImpl, "rules")).toMatchObject({ ok: true });
  expect(await run(accountA, job.id, config, fetchImpl, "rules")).toMatchObject({ ok: true });
  expect(await run(accountA, job.id, config, fetchImpl, "rules")).toEqual({ ok: false, error: "rate_limited" });

  const jobB = await createReviewedJob(accountB);
  // Runs in flight count toward the daily limit too, so a storm is refused by whichever limit binds
  // first; either way, no more than the attempt cap is ever created.
  const storm = await Promise.all(Array.from({ length: 25 }, () => run(accountB, jobB.id, config, refused(), "rules")));
  const created = await prisma.aiAnalysisRun.count({ where: { savedJobId: jobB.id } });
  expect(created).toBeGreaterThan(0);
  expect(created).toBeLessThanOrEqual(6);
  expect(storm.filter(r => !r.ok && (r.error === "attempts_exceeded" || r.error === "rate_limited"))).toHaveLength(25 - created);
  for (let i = created; i < 6; i++) expect(await run(accountB, jobB.id, config, refused(), "rules")).toEqual({ ok: false, error: "service_unavailable" });
  expect(await run(accountB, jobB.id, config, refused(), "rules")).toEqual({ ok: false, error: "attempts_exceeded" });
  expect(await prisma.aiAnalysisRun.count({ where: { savedJobId: jobB.id } })).toBe(6);
});

it("marks runs abandoned by a crash as failed and keeps their reservation held", async () => {
  await setCloudAiConsent(accountA, true);
  const job = await createReviewedJob(accountA);
  const stuck = await prisma.aiAnalysisRun.create({
    data: { userId: await userId(accountA), savedJobId: job.id, provider: "anthropic", model: MODEL, startedAt: new Date(Date.now() - STALE_RUN_MS - 60_000), billingState: "RESERVED", reservedMicroUsd: 90_000 },
  });
  const { fetchImpl } = fakeCloud();
  expect(await run(accountA, job.id, cloudConfig([await userId(accountA)]), fetchImpl)).toMatchObject({ ok: true });
  expect(await prisma.aiAnalysisRun.findUniqueOrThrow({ where: { id: stuck.id } })).toMatchObject({
    status: "FAILED", errorCode: "abandoned", billingState: "UNRESOLVED", reservedMicroUsd: 90_000, confirmedMicroUsd: null, countsTowardLimit: true,
  });
});

// --- Database guarantees ---------------------------------------------------------------------------

it("database constraints keep the ledger consistent", async () => {
  const owner = await userId(accountA);
  const base = { userId: owner, provider: "anthropic", model: MODEL };
  const done = { status: "FAILED" as const, finishedAt: new Date(), errorCode: "provider_timeout" };
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, billingState: "RESERVED", reservedMicroUsd: 1000, confirmedMicroUsd: 5 } })).rejects.toThrow();
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, billingState: "UNRESOLVED", reservedMicroUsd: 1000 } })).rejects.toThrow(); // still STARTED
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, ...done, billingState: "UNRESOLVED", reservedMicroUsd: 1000, confirmedMicroUsd: 1 } })).rejects.toThrow();
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, ...done, billingState: "CONFIRMED", reservedMicroUsd: 1000 } })).rejects.toThrow();
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, ...done, billingState: "CONFIRMED", reservedMicroUsd: 1000, confirmedMicroUsd: -1 } })).rejects.toThrow();
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, billingState: "NONE", reservedMicroUsd: 10 } })).rejects.toThrow();
  await expect(prisma.aiAnalysisRun.create({ data: { ...base, ...done, billingState: "UNRESOLVED", reservedMicroUsd: 1000, reconciledAt: new Date() } })).rejects.toThrow();
  await expect(prisma.user.update({ where: { id: owner }, data: { aiCloudConsentVersion: 1, aiCloudConsentAt: null } })).rejects.toThrow();
});

it("consent and cloud runs are scoped to the signed-in account", async () => {
  const { runJobMatch, setCloudConsent } = await import("@/app/jobs/match-actions");
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(entries)) data.append(k, v);
    return data;
  };
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await setCloudConsent({}, form({ choice: "grant", understood: "on" }))).error).toContain("session");

  signIn(accountB);
  expect((await setCloudConsent({}, form({ choice: "grant" }))).error).toContain("Confirm");
  expect((await setCloudConsent({}, form({ choice: "maybe" }))).error).toContain("Choose");
  expect(await setCloudConsent({}, form({ choice: "grant", understood: "on" }))).toEqual({ message: "Consent saved." });
  const [a, b] = await Promise.all([accountA, accountB].map(id => prisma.user.findUniqueOrThrow({ where: { supabaseAuthId: id } })));
  expect(a.aiCloudConsentAt).toBeNull();
  expect(b).toMatchObject({ aiCloudConsentVersion: 1, aiCloudConsentAt: expect.any(Date) });

  const jobA = await createReviewedJob(accountA);
  expect((await runJobMatch({}, form({ jobId: jobA.id, provider: "gpt" }))).error).toBe("Choose an analysis method.");
  expect(await run(accountB, jobA.id, cloudConfig([b.id]), fakeCloud().fetchImpl)).toEqual({ ok: false, error: "not_found" });
});
