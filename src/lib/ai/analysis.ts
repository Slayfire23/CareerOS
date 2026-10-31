import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { validateRequirements, type Requirement } from "@/lib/job-requirements";
import { CLOUD_MAX_INPUT_TOKENS, CLOUD_MAX_OUTPUT_TOKENS, type AiConfig, type CloudConfig } from "@/lib/ai/config";
import { AiServiceError, callMatchService, type Billed } from "@/lib/ai/client";
import { parseProviderRequestId, parseUsage } from "@/lib/ai/client-parsing";
import { CLOUD_CONSENT_VERSION, hasCurrentCloudConsent } from "@/lib/ai/consent";
import {
  EvidenceError,
  buildEvidence,
  buildRequirements,
  currentMonth,
  evidenceFingerprint,
  type AnalysisProvider,
  type MatchRequest,
  type Verdict,
} from "@/lib/ai/evidence";
import { MatchValidationError, validateMatchResponse, type Finding } from "@/lib/ai/match-validation";
import { costMicroUsd, reservationMicroUsd, type TokenUsage } from "@/lib/ai/pricing";
import { redactForCloud, type RedactionTerms } from "@/lib/ai/redaction";

// Server-side analysis workflow. Every function takes the verified Supabase user id and scopes
// every query to that user; callers must obtain it from supabase.auth.getUser().

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const NOTE_MAX = 500;
/// A run still in progress after this long is treated as abandoned (for example, a server crash).
export const STALE_RUN_MS = 10 * 60 * 1000;
/// Bytes allowed for the AI service's system prompt, output schema, and framing on top of the
/// request body. Tokens never outnumber UTF-8 bytes, so this keeps the reservation a true bound.
export const PROMPT_OVERHEAD_TOKENS = 12_000;

/// Failures that never reached an analysis. They don't use up the daily limit (the attempt cap
/// still applies) and, for cloud runs, release their reservation.
const NOT_PROCESSED = new Set<string>([
  "service_unavailable",
  "service_rejected",
  "replay_store_unavailable",
  "provider_busy",
  "provider_unavailable",
  "provider_request_rejected",
  "over_budget",
]);

export type Readiness = "ready" | "not_reviewed" | "out_of_date" | "no_requirements";
export type RunErrorCode =
  | "not_configured"
  | "not_found"
  | Exclude<Readiness, "ready">
  | "profile_missing"
  | "profile_too_large"
  | "too_large_for_cloud"
  | "cloud_unavailable"
  | "consent_required"
  | "rate_limited"
  | "attempts_exceeded"
  | "user_budget_exceeded"
  | "budget_exceeded"
  | AiServiceError["code"]
  | "response_rejected";
export type RunResult = { ok: true; analysisId: string } | { ok: false; error: RunErrorCode };

type Job = { id: string; description: string; reviewedDescription: string | null; reviewVersion: number; requirements: unknown };

export function jobReadiness(job: Job): Readiness {
  if (job.reviewedDescription === null) return "not_reviewed";
  if (job.reviewedDescription !== job.description) return "out_of_date";
  return Array.isArray(job.requirements) && job.requirements.length ? "ready" : "no_requirements";
}

async function ownerOf(supabaseAuthId: string) {
  return prisma.user.findUnique({
    where: { supabaseAuthId },
    select: { id: true, aiCloudConsentAt: true, aiCloudConsentVersion: true },
  });
}

async function ownedJob(userId: string, jobId: string) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(jobId)) return null;
  return prisma.savedJob.findFirst({
    where: { id: jobId, userId },
    select: { id: true, title: true, company: true, description: true, reviewedDescription: true, reviewVersion: true, requirements: true },
  });
}

/** The owner's confirmed profile entries, in the shape the evidence builder needs. */
async function ownedEvidenceProfile(userId: string) {
  return prisma.careerProfile.findFirst({
    where: { userId },
    select: {
      technicalSkills: { select: { id: true, name: true, proficiency: true }, orderBy: { normalizedName: "asc" } },
      professionalExperiences: { select: { id: true, jobTitle: true, startMonth: true, endMonth: true, description: true } },
      educationEntries: { select: { id: true, qualification: true, fieldOfStudy: true, startMonth: true, endMonth: true, description: true } },
      projects: { select: { id: true, title: true, description: true, contribution: true, results: true, skills: true } },
    },
  });
}

/** Personal and company values to remove from free text before it goes to a cloud provider. */
async function redactionTerms(userId: string, jobCompany: string, contactEmail: string | null): Promise<RedactionTerms> {
  const profile = await prisma.careerProfile.findFirst({
    where: { userId },
    select: {
      displayName: true,
      professionalExperiences: { select: { company: true } },
      educationEntries: { select: { institution: true } },
    },
  });
  return {
    names: profile ? [profile.displayName] : [],
    companies: profile?.professionalExperiences.map(e => e.company) ?? [],
    schools: profile?.educationEntries.map(e => e.institution) ?? [],
    employers: [jobCompany],
    emails: contactEmail ? [contactEmail] : [],
  };
}

// --- Limits and the cost ledger ---------------------------------------------------------------

/**
 * Money held against a budget: confirmed charges and in-flight reservations inside the window,
 * plus every unresolved charge regardless of age, which stays held until it is reconciled.
 */
async function heldMicroUsd(tx: Prisma.TransactionClient, since: Date, userId?: string): Promise<number> {
  const userFilter = userId ? Prisma.sql`AND "userId" = ${userId}::uuid` : Prisma.empty;
  const rows = await tx.$queryRaw<{ held: bigint | null }[]>`
    SELECT COALESCE(SUM(CASE WHEN "billingState" = 'CONFIRMED' THEN "confirmedMicroUsd" ELSE "reservedMicroUsd" END), 0)::bigint AS held
    FROM "AiAnalysisRun"
    WHERE ("billingState" = 'UNRESOLVED' OR ("billingState" IN ('RESERVED', 'CONFIRMED') AND "startedAt" >= ${since}))
    ${userFilter}`;
  return Number(rows[0]?.held ?? 0);
}

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

type Reservation =
  | { ok: true; runId: string }
  | { ok: false; error: "rate_limited" | "attempts_exceeded" | "user_budget_exceeded" | "budget_exceeded" };

/**
 * Reserve one run. A per-user advisory lock serializes each user's requests, and cloud runs also
 * take a global lock, always in that order, so concurrent requests can't exceed any limit.
 */
async function reserveRun(options: {
  userId: string;
  jobId: string;
  provider: AnalysisProvider;
  cloud: CloudConfig | null;
  reservation: number;
  dailyLimit: number;
  attemptLimit: number;
  now: Date;
}): Promise<Reservation> {
  const { userId, cloud, now } = options;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ai-analysis:${userId}`}, 0))) AS l`;
    if (cloud) await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended('ai-spend:global', 0))) AS l`;

    // Runs left in progress by a crash: failed, counted, and (if cloud) held until reconciled.
    await tx.$executeRaw`
      UPDATE "AiAnalysisRun"
      SET "status" = 'FAILED', "errorCode" = 'abandoned', "finishedAt" = ${now},
          "billingState" = CASE WHEN "billingState" = 'RESERVED' THEN 'UNRESOLVED'::"AiBillingState" ELSE "billingState" END
      WHERE "userId" = ${userId}::uuid AND "status" = 'STARTED' AND "startedAt" < ${new Date(now.getTime() - STALE_RUN_MS)}`;

    const since = new Date(now.getTime() - WINDOW_MS);
    const counted = await tx.aiAnalysisRun.count({ where: { userId, startedAt: { gt: since }, countsTowardLimit: true } });
    if (counted >= options.dailyLimit) return { ok: false, error: "rate_limited" };
    const attempts = await tx.aiAnalysisRun.count({ where: { userId, startedAt: { gt: since } } });
    if (attempts >= options.attemptLimit) return { ok: false, error: "attempts_exceeded" };

    if (cloud) {
      const amount = options.reservation;
      if ((await heldMicroUsd(tx, since, userId)) + amount > cloud.userDailyMicroUsd) return { ok: false, error: "user_budget_exceeded" };
      if ((await heldMicroUsd(tx, since)) + amount > cloud.globalDailyMicroUsd) return { ok: false, error: "budget_exceeded" };
      if ((await heldMicroUsd(tx, monthStart(now))) + amount > cloud.globalMonthlyMicroUsd) return { ok: false, error: "budget_exceeded" };
    }

    const run = await tx.aiAnalysisRun.create({
      data: {
        userId,
        savedJobId: options.jobId,
        provider: options.provider,
        model: cloud?.model ?? null,
        startedAt: now,
        billingState: cloud ? "RESERVED" : "NONE",
        reservedMicroUsd: cloud ? options.reservation : 0,
      },
      select: { id: true },
    });
    return { ok: true, runId: run.id };
  }, { maxWait: 10_000, timeout: 10_000 });
}

/** Billing fields for a finished cloud run. Only provider-reported usage confirms a charge. */
function settledBilling(model: string, billed: Billed, usage: TokenUsage | null) {
  if (billed === "no") return { billingState: "RELEASED" as const };
  if (billed === "yes" && usage) {
    return {
      billingState: "CONFIRMED" as const,
      confirmedMicroUsd: costMicroUsd(model, usage),
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      cacheWriteTokens: usage.cache_creation_input_tokens,
    };
  }
  return { billingState: "UNRESOLVED" as const };
}

async function failRun(
  run: { id: string; userId: string; cloud: CloudConfig | null },
  outcome: { code: string; billed: Billed; usage: TokenUsage | null; providerRequestId: string | null },
) {
  await prisma.aiAnalysisRun.updateMany({
    where: { id: run.id, userId: run.userId, status: "STARTED" },
    data: {
      status: "FAILED",
      errorCode: outcome.code,
      finishedAt: new Date(),
      countsTowardLimit: !(outcome.billed === "no" && NOT_PROCESSED.has(outcome.code)),
      providerRequestId: outcome.providerRequestId,
      ...(run.cloud ? settledBilling(run.cloud.model, outcome.billed, outcome.usage) : {}),
    },
  });
}

// --- Running an analysis ------------------------------------------------------------------------

export async function runJobAnalysis(options: {
  supabaseAuthId: string;
  jobId: string;
  provider?: AnalysisProvider;
  config: AiConfig;
  /** The signed-in account's email, removed from any text sent to a cloud provider. */
  contactEmail?: string | null;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<RunResult> {
  const { config } = options;
  const provider = options.provider ?? "rules";
  if (!config.enabled) return { ok: false, error: "not_configured" };
  const now = options.now ?? new Date();

  const user = await ownerOf(options.supabaseAuthId);
  const job = user && (await ownedJob(user.id, options.jobId));
  if (!user || !job) return { ok: false, error: "not_found" };
  const readiness = jobReadiness(job);
  if (readiness !== "ready") return { ok: false, error: readiness };

  // The cloud provider needs full configuration, an allow-listed account, and current consent.
  let cloud: CloudConfig | null = null;
  if (provider === "anthropic") {
    cloud = config.cloud;
    if (!cloud || !cloud.allowedUserIds.has(user.id)) return { ok: false, error: "cloud_unavailable" };
    if (!hasCurrentCloudConsent(user)) return { ok: false, error: "consent_required" };
  }

  const profile = await ownedEvidenceProfile(user.id);
  if (!profile) return { ok: false, error: "profile_missing" };

  let request: MatchRequest;
  let fingerprint: string;
  let reservation = 0;
  try {
    const requirementsList: Requirement[] = validateRequirements(job.requirements);
    const evidence = buildEvidence(profile);
    fingerprint = evidenceFingerprint(evidence); // always of the unredacted profile
    const requirements = buildRequirements(requirementsList);
    request = { request_id: randomUUID(), provider, as_of_month: currentMonth(now), requirements, evidence };
    if (cloud) {
      const redacted = redactForCloud(evidence, requirements, await redactionTerms(user.id, job.company, options.contactEmail ?? null));
      request = { ...request, ...redacted };
      const maxInput = Buffer.byteLength(JSON.stringify(request), "utf8") + PROMPT_OVERHEAD_TOKENS;
      if (maxInput > CLOUD_MAX_INPUT_TOKENS) return { ok: false, error: "too_large_for_cloud" };
      request.budget = { max_input_tokens: maxInput, max_output_tokens: CLOUD_MAX_OUTPUT_TOKENS };
      reservation = reservationMicroUsd(cloud.model, maxInput, CLOUD_MAX_OUTPUT_TOKENS);
    }
  } catch (error) {
    if (error instanceof EvidenceError) return { ok: false, error: error.code };
    throw error;
  }

  const reserved = await reserveRun({
    userId: user.id,
    jobId: job.id,
    provider,
    cloud,
    reservation,
    dailyLimit: config.dailyLimit,
    attemptLimit: config.attemptLimit,
    now,
  });
  if (!reserved.ok) return { ok: false, error: reserved.error };
  const run = { id: reserved.runId, userId: user.id, cloud };

  let validated;
  let raw: unknown;
  try {
    raw = await callMatchService(config, request, options.fetchImpl);
    validated = validateMatchResponse(request, raw, { provider, model: cloud?.model ?? null });
  } catch (error) {
    if (error instanceof AiServiceError) {
      await failRun(run, { code: error.code, billed: error.billed, usage: error.usage, providerRequestId: error.providerRequestId });
      return { ok: false, error: error.code };
    }
    if (error instanceof MatchValidationError) {
      // The service answered, so a cloud call was made; confirm the charge only if usage is readable.
      const body = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
      await failRun(run, {
        code: "response_rejected",
        billed: cloud ? "yes" : "no",
        usage: parseUsage(body.usage),
        providerRequestId: parseProviderRequestId(body.provider_request_id),
      });
      return { ok: false, error: "response_rejected" };
    }
    await failRun(run, { code: "service_unavailable", billed: "unknown", usage: null, providerRequestId: null });
    throw error;
  }

  const billing = cloud ? settledBilling(cloud.model, "yes", validated.usage) : {};
  const analysis = await prisma.$transaction(async tx => {
    // Both rows commit together or not at all; on failure the catch below records the run.
    const created = await tx.jobMatchAnalysis.create({
      data: {
        userId: user.id,
        savedJobId: job.id,
        runId: run.id,
        requirementsVersion: job.reviewVersion,
        profileFingerprint: fingerprint,
        provider: validated.provider,
        model: validated.model,
        methodVersion: validated.methodVersion,
        requirements: request.requirements,
        findings: validated.findings,
        verdictCounts: validated.verdictCounts,
      },
      select: { id: true },
    });
    await tx.aiAnalysisRun.update({
      where: { id: run.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), providerRequestId: validated.providerRequestId, ...billing },
    });
    return created;
  }).catch(async error => {
    await failRun(run, { code: "save_failed", billed: cloud ? "yes" : "no", usage: validated.usage, providerRequestId: validated.providerRequestId });
    throw error;
  });
  return { ok: true, analysisId: analysis.id };
}

// --- Reconciliation (operators only; never exposed to users) ----------------------------------

/** Settle an unresolved cloud charge once its real cost is known from the provider's console. */
export async function reconcileUnresolvedRun(
  runId: string,
  outcome: { confirmedMicroUsd: number } | { released: true },
): Promise<boolean> {
  if ("confirmedMicroUsd" in outcome && (!Number.isSafeInteger(outcome.confirmedMicroUsd) || outcome.confirmedMicroUsd < 0)) return false;
  const result = await prisma.aiAnalysisRun.updateMany({
    where: { id: runId, billingState: "UNRESOLVED" },
    data: "released" in outcome
      ? { billingState: "RELEASED", reconciledAt: new Date() }
      : { billingState: "CONFIRMED", confirmedMicroUsd: outcome.confirmedMicroUsd, reconciledAt: new Date() },
  });
  return result.count === 1;
}

// --- Feedback ---------------------------------------------------------------------------------

export type FeedbackChoice = "agree" | "disagree";
export type FeedbackEntry = { choice: FeedbackChoice; note: string | null; updatedAt: string };
export type FeedbackResult = { ok: true; version: number } | { ok: false; error: "not_found" | "invalid" | "conflict" };

export async function saveAnalysisFeedback(options: {
  supabaseAuthId: string;
  analysisId: string;
  version: number;
  requirementIndex: number;
  choice: FeedbackChoice | "clear";
  note: string | null;
}): Promise<FeedbackResult> {
  const user = await ownerOf(options.supabaseAuthId);
  if (!user || !/^[0-9a-f-]{36}$/i.test(options.analysisId)) return { ok: false, error: "not_found" };
  const analysis = await prisma.jobMatchAnalysis.findFirst({
    where: { id: options.analysisId, userId: user.id },
    select: { id: true, findings: true, feedback: true, feedbackVersion: true },
  });
  if (!analysis) return { ok: false, error: "not_found" };

  const findings = analysis.findings as Finding[];
  const note = options.note?.trim() || null;
  if (!findings.some(f => f.requirementIndex === options.requirementIndex) || (note && note.length > NOTE_MAX)) {
    return { ok: false, error: "invalid" };
  }
  const feedback = { ...(analysis.feedback as Record<string, FeedbackEntry>) };
  const key = String(options.requirementIndex);
  if (options.choice === "clear") delete feedback[key];
  else feedback[key] = { choice: options.choice, note, updatedAt: new Date().toISOString() };

  // Optimistic concurrency: only the version the user saw may be updated.
  const updated = await prisma.jobMatchAnalysis.updateMany({
    where: { id: analysis.id, userId: user.id, feedbackVersion: options.version },
    data: { feedback, feedbackVersion: { increment: 1 } },
  });
  return updated.count === 1 ? { ok: true, version: options.version + 1 } : { ok: false, error: "conflict" };
}

// --- Consent ----------------------------------------------------------------------------------

/** Record (or withdraw) consent to the current cloud consent text. */
export async function setCloudAiConsent(supabaseAuthId: string, consent: boolean): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { supabaseAuthId },
    data: consent
      ? { aiCloudConsentAt: new Date(), aiCloudConsentVersion: CLOUD_CONSENT_VERSION }
      : { aiCloudConsentAt: null, aiCloudConsentVersion: null },
  });
  return result.count === 1;
}

// --- Page data ---------------------------------------------------------------------------------

export type AnalysisView = {
  id: string;
  createdAt: Date;
  provider: string;
  model: string | null;
  methodVersion: string;
  requirements: MatchRequest["requirements"];
  findings: Finding[];
  verdictCounts: Record<Verdict, number>;
  feedback: Record<string, FeedbackEntry>;
  feedbackVersion: number;
  outOfDate: { requirements: boolean; profile: boolean };
};

export type CloudStatus = { available: boolean; consentCurrent: boolean };

export async function getAnalysisPageData(supabaseAuthId: string, jobId: string, config: AiConfig, now = new Date()) {
  const user = await ownerOf(supabaseAuthId);
  const job = user && (await ownedJob(user.id, jobId));
  if (!user || !job) return null;

  const since = new Date(now.getTime() - WINDOW_MS);
  const [latest, history, countedToday, profile] = await Promise.all([
    prisma.jobMatchAnalysis.findFirst({
      where: { savedJobId: job.id, userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiAnalysisRun.findMany({
      where: { savedJobId: job.id, userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, status: true, provider: true, model: true, errorCode: true, startedAt: true, analysis: { select: { verdictCounts: true } } },
    }),
    prisma.aiAnalysisRun.count({ where: { userId: user.id, startedAt: { gt: since }, countsTowardLimit: true } }),
    ownedEvidenceProfile(user.id),
  ]);

  let currentFingerprint: string | null = null;
  try {
    currentFingerprint = profile ? evidenceFingerprint(buildEvidence(profile)) : null;
  } catch {
    currentFingerprint = null;
  }

  const view: AnalysisView | null = latest && {
    id: latest.id,
    createdAt: latest.createdAt,
    provider: latest.provider,
    model: latest.model,
    methodVersion: latest.methodVersion,
    requirements: latest.requirements as AnalysisView["requirements"],
    findings: latest.findings as Finding[],
    verdictCounts: latest.verdictCounts as AnalysisView["verdictCounts"],
    feedback: latest.feedback as AnalysisView["feedback"],
    feedbackVersion: latest.feedbackVersion,
    outOfDate: {
      requirements: latest.requirementsVersion !== job.reviewVersion || jobReadiness(job) !== "ready",
      profile: currentFingerprint !== latest.profileFingerprint,
    },
  };

  const cloud: CloudStatus = {
    available: Boolean(config.enabled && config.cloud?.allowedUserIds.has(user.id)),
    consentCurrent: hasCurrentCloudConsent(user),
  };

  return {
    job: { id: job.id, title: job.title, company: job.company },
    readiness: jobReadiness(job),
    latest: view,
    history,
    remainingToday: config.enabled ? Math.max(0, config.dailyLimit - countedToday) : 0,
    dailyLimit: config.enabled ? config.dailyLimit : 0,
    configured: config.enabled,
    cloud,
  };
}
