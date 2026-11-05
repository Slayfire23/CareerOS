import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { validateRequirements, type Requirement } from "@/lib/job-requirements";
import { CLOUD_MAX_INPUT_TOKENS, CLOUD_MAX_OUTPUT_TOKENS, LOCAL_AI_TIMEOUT_MS, type AiConfig, type CloudConfig } from "@/lib/ai/config";
import { AiServiceError, callMatchService, callSuggestService, type Billed } from "@/lib/ai/client";
import { parseProviderRequestId, parseUsage } from "@/lib/ai/client-parsing";
import { CLOUD_CONSENT_VERSION, hasCurrentCloudConsent } from "@/lib/ai/consent";
import {
  EvidenceError,
  buildEvidence,
  buildRequirements,
  currentMonth,
  evidenceFingerprint,
  type AnalysisProvider,
  type Evidence,
  type MatchRequest,
  type MatchRequirement,
  type Verdict,
} from "@/lib/ai/evidence";
import { MatchValidationError, validateMatchResponse, type AiAssist, type Finding, type Suggestion } from "@/lib/ai/match-validation";
import { costMicroUsd, reservationMicroUsd, type TokenUsage } from "@/lib/ai/pricing";
import { redactForCloud, type RedactionTerms } from "@/lib/ai/redaction";
import { RULES_VERSION, rulesResponse } from "@/lib/ai/rules/engine";
import { applyAnswers, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import { buildReviewQueue, keyForRequirement, type ReviewQueue } from "@/lib/ai/rules/review-queue";
import { ASSIST_PROMPT_VERSION, buildSuggestRequest, checkPointers, parseSuggestResponse, sendableRequirements } from "@/lib/ai/rules/suggestions";

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
  | "local_ai_unavailable"
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
      professionalExperiences: { select: { id: true, jobTitle: true, startMonth: true, endMonth: true, description: true, clarifications: { select: { id: true, detail: true }, where: { outcome: "ROLE_DETAIL_ADDED", status: "ACTIVE" }, orderBy: { id: "asc" } } } },
      educationEntries: { select: { id: true, qualification: true, fieldOfStudy: true, startMonth: true, endMonth: true, description: true, clarifications: { select: { id: true }, where: { outcome: "ENTRY_ADDED", status: "ACTIVE" } } } },
      projects: { select: { id: true, title: true, description: true, contribution: true, results: true, skills: true } },
    },
  });
}

/** A person's active answers, for the rules only. */
async function activeAnswers(userId: string): Promise<LinkedAnswer[]> {
  const rows = await prisma.candidateClarification.findMany({
    where: { userId, status: "ACTIVE", questionKey: { not: null }, outcome: { in: ["ROLE_DETAIL_ADDED", "DENIED"] } },
    select: { id: true, questionKey: true, coveredKeys: true, outcome: true, detail: true },
  });
  return rows.flatMap(r => [...new Set([r.questionKey!, ...r.coveredKeys])].map((key): LinkedAnswer => (r.outcome === "DENIED"
    ? { action: "deny", questionKey: key }
    : { action: "confirm", questionKey: key, evidenceId: `experience:${r.id}`, detail: r.detail ?? "" })));
}

const reviewKeyFor = (r: MatchRequirement) => keyForRequirement(r);

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
  model: string | null;
  cloud: CloudConfig | null;
  reservation: number;
  dailyLimit: number;
  attemptLimit: number;
  now: Date;
  isRecheck?: boolean;
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
    if (!options.isRecheck) {
      const counted = await tx.aiAnalysisRun.count({ where: { userId, startedAt: { gt: since }, countsTowardLimit: true, isRecheck: false } });
      if (counted >= options.dailyLimit) return { ok: false, error: "rate_limited" };
      const attempts = await tx.aiAnalysisRun.count({ where: { userId, startedAt: { gt: since }, isRecheck: false } });
      if (attempts >= options.attemptLimit) return { ok: false, error: "attempts_exceeded" };
    }

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
        model: options.model,
        startedAt: now,
        billingState: cloud ? "RESERVED" : "NONE",
        reservedMicroUsd: cloud ? options.reservation : 0,
        isRecheck: options.isRecheck === true,
        countsTowardLimit: !options.isRecheck,
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
  /** A rules-only recheck after a person's answer: outside the analysis limits. */
  recheck?: boolean;
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
  // Local AI (Ollama on CareerOS-controlled hardware; in "assisted" it only adds suggestions)
  // needs to be turned on for this account. Nothing goes to an AI company, so no cloud consent or
  // redaction applies.
  let localModel: string | null = null;
  if (provider === "ollama" || provider === "hybrid" || provider === "assisted") {
    const localAi = config.localAi;
    if (!localAi || !localAi.allowedUserIds.has(user.id)) return { ok: false, error: "local_ai_unavailable" };
    localModel = localAi.model;
  }
  const expectedModel = cloud?.model ?? localModel;
  const usesRules = provider === "rules" || provider === "assisted";
  // Only the optional methods need the AI service; the rules engine runs right here.
  const service = config.serviceUrl && config.secret ? { serviceUrl: config.serviceUrl, secret: config.secret } : null;
  if (!usesRules && !service) return { ok: false, error: "service_unavailable" };

  const profile = await ownedEvidenceProfile(user.id);
  if (!profile) return { ok: false, error: "profile_missing" };

  let request: MatchRequest;
  let fingerprint: string;
  let reservation = 0;
  let linked: LinkedAnswer[] = [];
  try {
    const requirementsList: Requirement[] = validateRequirements(job.requirements);
    const evidence = buildEvidence(profile);
    linked = config.reviewEnabled && usesRules ? await activeAnswers(user.id) : [];
    fingerprint = evidenceFingerprint(evidence, linked); // always of the unredacted profile
    const requirements = buildRequirements(requirementsList);
    request = { request_id: randomUUID(), provider, as_of_month: currentMonth(now), requirements, evidence, ...(linked.length ? { linked_answers: linked } : {}) };
    // Only the rules on this server use an answer's source; the service's strict format has no such field.
    if (!usesRules) request.evidence = evidence.map(item => (("source" in item) ? (Object.fromEntries(Object.entries(item).filter(([key]) => key !== "source")) as Evidence) : item));
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
    model: expectedModel,
    cloud,
    reservation,
    dailyLimit: config.dailyLimit,
    attemptLimit: config.attemptLimit,
    now,
    isRecheck: options.recheck === true && provider === "rules",
  });
  if (!reserved.ok) return { ok: false, error: reserved.error };
  const run = { id: reserved.runId, userId: user.id, cloud };

  if (usesRules) {
    return analyzeWithRules({ request, provider, model: localModel, run, jobId: job.id, requirementsVersion: job.reviewVersion, fingerprint, service, fetchImpl: options.fetchImpl });
  }

  let validated;
  let raw: unknown;
  try {
    raw = await callMatchService(service!, request, options.fetchImpl, localModel ? LOCAL_AI_TIMEOUT_MS : undefined);
    validated = validateMatchResponse(request, raw, { provider, model: expectedModel });
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

  const billing = cloud
    ? settledBilling(cloud.model, "yes", validated.usage)
    : validated.usage // local model: free, but its token counts are useful for tuning
      ? { inputTokens: validated.usage.input_tokens, outputTokens: validated.usage.output_tokens }
      : {};
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

/**
 * Rules-only and AI-assisted analysis. The verdicts are decided here with no network call and saved
 * before local AI is asked anything, so local AI being off, slow, or wrong can't lose or change them.
 * The later step can only write the separate suggestions column.
 */
async function analyzeWithRules(options: {
  request: MatchRequest;
  provider: "rules" | "assisted";
  model: string | null;
  run: { id: string; userId: string; cloud: CloudConfig | null };
  jobId: string;
  requirementsVersion: number;
  fingerprint: string;
  service: { serviceUrl: string; secret: string } | null;
  fetchImpl?: typeof fetch;
}): Promise<RunResult> {
  const { request, provider, model, run } = options;
  const assisted = provider === "assisted";
  const methodVersion = assisted ? `assisted/${RULES_VERSION}+${model}/${ASSIST_PROMPT_VERSION}` : RULES_VERSION;
  let validated;
  try {
    const answers = request.linked_answers ?? [];
    const body = rulesResponse(request, { provider, model, methodVersion }, answers.length ? findings => applyAnswers(request, findings, answers, reviewKeyFor) : undefined);
    // The same independent checks as any other result, on the same format.
    validated = validateMatchResponse(request, JSON.parse(JSON.stringify(body)), { provider, model });
  } catch (error) {
    await failRun(run, { code: "response_rejected", billed: "no", usage: null, providerRequestId: null });
    if (error instanceof MatchValidationError) return { ok: false, error: "response_rejected" };
    throw error;
  }

  const sent = assisted ? sendableRequirements(request, validated.findings) : [];
  const analysis = await prisma.$transaction(async tx => {
    const created = await tx.jobMatchAnalysis.create({
      data: {
        userId: run.userId,
        savedJobId: options.jobId,
        runId: run.id,
        requirementsVersion: options.requirementsVersion,
        profileFingerprint: options.fingerprint,
        provider,
        model,
        methodVersion,
        requirements: request.requirements,
        findings: validated.findings,
        verdictCounts: validated.verdictCounts,
        // Stays "unavailable" unless suggestions arrive below, so a crash can't overstate anything.
        aiAssist: assisted ? (sent.length ? "unavailable" : "not_needed") : null,
      },
      select: { id: true },
    });
    await tx.aiAnalysisRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    return created;
  }).catch(async error => {
    await failRun(run, { code: "save_failed", billed: "no", usage: null, providerRequestId: null });
    throw error;
  });

  if (sent.length && model && options.service) {
    await addSuggestions({ ...options, model, sent, findings: validated.findings, analysisId: analysis.id, service: options.service }).catch(error => {
      // Never fails the analysis, and logs no content: the verified results are already saved.
      console.warn("AI suggestions skipped:", error instanceof Error ? error.name : "unknown");
    });
  }
  return { ok: true, analysisId: analysis.id };
}

/** Ask local AI for pointers, check each against the person's own profile, and store what survives.
 * This update names only the suggestion columns; findings and counts can't change. */
async function addSuggestions(options: {
  request: MatchRequest;
  model: string;
  sent: MatchRequest["requirements"];
  findings: Finding[];
  analysisId: string;
  run: { id: string; userId: string };
  service: { serviceUrl: string; secret: string };
  fetchImpl?: typeof fetch;
}) {
  const requestId = randomUUID();
  const payload = buildSuggestRequest(options.request, options.sent, requestId);
  const reply = parseSuggestResponse(await callSuggestService(options.service, payload, options.fetchImpl), requestId, options.model);
  if (!reply) return;
  const { suggestions } = checkPointers(options.request, options.sent, options.findings, reply.pointers);
  await prisma.jobMatchAnalysis.updateMany({
    where: { id: options.analysisId, userId: options.run.userId },
    data: { aiSuggestions: suggestions, aiAssist: reply.aiAssist },
  });
  if (reply.tokens) await prisma.aiAnalysisRun.updateMany({ where: { id: options.run.id, userId: options.run.userId }, data: reply.tokens });
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
  suggestions: Suggestion[];
  aiAssist: AiAssist | null;
  feedback: Record<string, FeedbackEntry>;
  feedbackVersion: number;
  outOfDate: { requirements: boolean; profile: boolean };
};

export type CloudStatus = { available: boolean; consentCurrent: boolean };
export type LocalAiStatus = { available: boolean; model: string | null };

export type ClarificationAnswer = { id: string; requirementText: string; detail: string | null; outcome: string; createdAt: Date; roleTitle: string | null; qualification: string | null };

export type ReviewAnswer = { id: string; requirementText: string; detail: string | null; outcome: string; status: string; createdAt: Date; roleTitle: string | null; qualification: string | null };
export type ReviewPageData = { queue: ReviewQueue; answers: ReviewAnswer[]; changes: { requirementText: string; before: string; after: string; at: Date }[] };

/** Masks results resting on an answer that no longer counts, so a revocation takes effect everywhere at once,
 * even for a job not yet run again. */
function maskRevoked(view: AnalysisView, revokedEvidence: ReadonlySet<string>, activeDenials: ReadonlySet<string>): AnalysisView {
  const findings = view.findings.map(f => {
    const requirement = view.requirements.find(r => r.index === f.requirementIndex);
    const lapsedDenial = f.basis === "candidate_denied" && requirement && !activeDenials.has(reviewKeyFor(requirement));
    if (!lapsedDenial && !f.citations.some(c => revokedEvidence.has(c.evidenceId))) return f;
    return { ...f, verdict: "insufficient_information" as Verdict, explanation: "This relied on an answer you revoked. Run the analysis again.", citations: [], caveats: [], evidenceSources: [] };
  });
  const verdictCounts = { supported: 0, possible: 0, gap: 0, insufficient_information: 0 };
  for (const f of findings) verdictCounts[f.verdict]++;
  return { ...view, findings, verdictCounts };
}

export async function getAnalysisPageData(supabaseAuthId: string, jobId: string, config: AiConfig, now = new Date()) {
  const user = await ownerOf(supabaseAuthId);
  const job = user && (await ownedJob(user.id, jobId));
  if (!user || !job) return null;

  const [answers, declined, roles] = await Promise.all([
    prisma.candidateClarification.findMany({
      where: { userId: user.id, outcome: { not: "DECLINED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, requirementText: true, detail: true, outcome: true, createdAt: true, experience: { select: { jobTitle: true } }, education: { select: { qualification: true } } },
    }),
    prisma.candidateClarification.findMany({ where: { userId: user.id, savedJobId: job.id, outcome: "DECLINED" }, select: { id: true, requirementText: true } }),
    prisma.professionalExperience.findMany({ where: { profile: { userId: user.id } }, select: { id: true, jobTitle: true, company: true }, orderBy: { startMonth: "desc" } }),
  ]);

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
    currentFingerprint = profile ? evidenceFingerprint(buildEvidence(profile), config.reviewEnabled ? await activeAnswers(user.id) : []) : null;
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
    suggestions: latest.aiSuggestions as Suggestion[],
    aiAssist: latest.aiAssist as AiAssist | null,
    feedback: latest.feedback as AnalysisView["feedback"],
    feedbackVersion: latest.feedbackVersion,
    outOfDate: {
      requirements: latest.requirementsVersion !== job.reviewVersion || jobReadiness(job) !== "ready",
      profile: currentFingerprint !== latest.profileFingerprint,
    },
  };

  let shown = view;
  let review: ReviewPageData | null = null;
  if (config.reviewEnabled) {
    const rows = await prisma.candidateClarification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, requirementText: true, detail: true, outcome: true, status: true, createdAt: true, questionKey: true, coveredKeys: true, evidenceId: true, savedJobId: true, experience: { select: { jobTitle: true } }, education: { select: { qualification: true } } },
    });
    const keysOf = (r: (typeof rows)[number]) => [r.questionKey!, ...r.coveredKeys];
    const answered = new Set(rows.filter(r => r.status === "ACTIVE" && r.questionKey && r.outcome !== "SKIPPED" && r.outcome !== "DECLINED").flatMap(keysOf));
    const skipped = new Set(rows.filter(r => r.outcome === "SKIPPED" && r.savedJobId === job.id && r.questionKey).flatMap(keysOf));
    const revokedEvidence = new Set(rows.filter(r => r.status !== "ACTIVE" && r.evidenceId).map(r => r.evidenceId!));
    const activeDenials = new Set(rows.filter(r => r.status === "ACTIVE" && r.outcome === "DENIED" && r.questionKey).flatMap(keysOf));
    if (view) shown = maskRevoked(view, revokedEvidence, activeDenials);
    const events = await prisma.clarificationEvent.findMany({
      // An answer that's been deleted leaves the audit row, and nothing on this page.
      where: { userId: user.id, savedJobId: job.id, verdictBefore: { not: null }, verdictAfter: { not: null }, clarificationId: { in: rows.map(r => r.id) } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { requirementText: true, verdictBefore: true, verdictAfter: true, createdAt: true },
    });
    review = {
      queue: shown ? buildReviewQueue(shown.requirements, shown.findings, answered, skipped) : { questions: [], notShown: 0, settled: 0, total: 0, suppressedByEarlierAnswers: 0 },
      answers: rows.filter(r => r.outcome === "ROLE_DETAIL_ADDED" || r.outcome === "ENTRY_ADDED" || r.outcome === "DENIED").filter(r => r.status !== "SUPERSEDED").map(r => ({ id: r.id, requirementText: r.requirementText, detail: r.detail, outcome: r.outcome, status: r.status, createdAt: r.createdAt, roleTitle: r.experience?.jobTitle ?? null, qualification: r.education?.qualification ?? null })),
      changes: events.map(e => ({ requirementText: e.requirementText ?? "", before: e.verdictBefore!, after: e.verdictAfter!, at: e.createdAt })),
    };
  }

  const cloud: CloudStatus = {
    available: Boolean(config.enabled && config.cloud?.allowedUserIds.has(user.id)),
    consentCurrent: hasCurrentCloudConsent(user),
  };
  const localAi: LocalAiStatus = {
    available: Boolean(config.enabled && config.localAi?.allowedUserIds.has(user.id)),
    model: config.enabled ? config.localAi?.model ?? null : null,
  };

  return {
    job: { id: job.id, title: job.title, company: job.company },
    readiness: jobReadiness(job),
    latest: shown,
    review,
    history,
    remainingToday: config.enabled ? Math.max(0, config.dailyLimit - countedToday) : 0,
    dailyLimit: config.enabled ? config.dailyLimit : 0,
    configured: config.enabled,
    cloud,
    localAi,
    answers: answers.map((a): ClarificationAnswer => ({ id: a.id, requirementText: a.requirementText, detail: a.detail, outcome: a.outcome, createdAt: a.createdAt, roleTitle: a.experience?.jobTitle ?? null, qualification: a.education?.qualification ?? null })),
    declined,
    roles: roles.map(r => ({ id: r.id, label: `${r.jobTitle}, ${r.company}` })),
  };
}
