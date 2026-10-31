import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { validateRequirements, type Requirement } from "@/lib/job-requirements";
import { LOCAL_PROVIDERS, type AiConfig } from "@/lib/ai/config";
import { AiServiceError, callMatchService } from "@/lib/ai/client";
import {
  EvidenceError,
  buildEvidence,
  buildRequirements,
  currentMonth,
  evidenceFingerprint,
  type MatchRequest,
  type Verdict,
} from "@/lib/ai/evidence";
import { MatchValidationError, validateMatchResponse, type Finding } from "@/lib/ai/match-validation";

// Server-side analysis workflow. Every function takes the verified Supabase user id and scopes
// every query to that user; callers must obtain it from supabase.auth.getUser().

export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const NOTE_MAX = 500;

export type Readiness = "ready" | "not_reviewed" | "out_of_date" | "no_requirements";
export type RunErrorCode =
  | "not_configured"
  | "not_found"
  | Exclude<Readiness, "ready">
  | "profile_missing"
  | "profile_too_large"
  | "consent_required"
  | "rate_limited"
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
  return prisma.user.findUnique({ where: { supabaseAuthId }, select: { id: true, aiCloudConsentAt: true } });
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

/** Reserve one run under the daily limit. A per-user advisory lock serializes concurrent requests. */
async function reserveRun(userId: string, jobId: string, provider: string, limit: number, now: Date) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ai-analysis:${userId}`}, 0))) AS l`;
    const used = await tx.aiAnalysisRun.count({ where: { userId, startedAt: { gt: new Date(now.getTime() - WINDOW_MS) } } });
    if (used >= limit) return null;
    return tx.aiAnalysisRun.create({ data: { userId, savedJobId: jobId, provider, startedAt: now }, select: { id: true } });
  }, { maxWait: 10_000, timeout: 10_000 });
}

async function failRun(runId: string, userId: string, errorCode: string) {
  await prisma.aiAnalysisRun.updateMany({
    where: { id: runId, userId, status: "STARTED" },
    data: { status: "FAILED", errorCode, finishedAt: new Date() },
  });
}

export async function runJobAnalysis(options: {
  supabaseAuthId: string;
  jobId: string;
  config: AiConfig;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<RunResult> {
  const { config } = options;
  if (!config.enabled) return { ok: false, error: "not_configured" };
  const now = options.now ?? new Date();

  const user = await ownerOf(options.supabaseAuthId);
  const job = user && (await ownedJob(user.id, options.jobId));
  if (!user || !job) return { ok: false, error: "not_found" };
  const readiness = jobReadiness(job);
  if (readiness !== "ready") return { ok: false, error: readiness };

  // Consent gate for any provider that would send data to a third-party AI provider.
  if (!LOCAL_PROVIDERS.has(config.provider) && !user.aiCloudConsentAt) return { ok: false, error: "consent_required" };

  const profile = await ownedEvidenceProfile(user.id);
  if (!profile) return { ok: false, error: "profile_missing" };

  let requirements: Requirement[];
  let request: MatchRequest;
  let fingerprint: string;
  try {
    requirements = validateRequirements(job.requirements);
    const evidence = buildEvidence(profile);
    fingerprint = evidenceFingerprint(evidence);
    request = { request_id: randomUUID(), as_of_month: currentMonth(now), requirements: buildRequirements(requirements), evidence };
  } catch (error) {
    if (error instanceof EvidenceError) return { ok: false, error: error.code };
    throw error;
  }

  const run = await reserveRun(user.id, job.id, config.provider, config.dailyLimit, now);
  if (!run) return { ok: false, error: "rate_limited" };

  let validated;
  try {
    const raw = await callMatchService(config, request, options.fetchImpl);
    validated = validateMatchResponse(request, raw, [config.provider]);
  } catch (error) {
    const code = error instanceof AiServiceError ? error.code : error instanceof MatchValidationError ? "response_rejected" : "service_unavailable";
    await failRun(run.id, user.id, code);
    if (error instanceof AiServiceError || error instanceof MatchValidationError) return { ok: false, error: code as RunErrorCode };
    throw error;
  }

  const analysis = await prisma.$transaction(async tx => {
    // Both rows commit together or not at all; on failure the catch below marks the run failed.
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
    await tx.aiAnalysisRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", finishedAt: new Date() } });
    return created;
  }).catch(async error => {
    await failRun(run.id, user.id, "save_failed");
    throw error;
  });
  return { ok: true, analysisId: analysis.id };
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

// --- Consent (prepared for cloud providers; not required by the local rules engine) ------------

export async function setCloudAiConsent(supabaseAuthId: string, consent: boolean): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { supabaseAuthId },
    data: { aiCloudConsentAt: consent ? new Date() : null },
  });
  return result.count === 1;
}

// --- Page data ---------------------------------------------------------------------------------

export type AnalysisView = {
  id: string;
  createdAt: Date;
  provider: string;
  methodVersion: string;
  requirements: MatchRequest["requirements"];
  findings: Finding[];
  verdictCounts: Record<Verdict, number>;
  feedback: Record<string, FeedbackEntry>;
  feedbackVersion: number;
  outOfDate: { requirements: boolean; profile: boolean };
};

export async function getAnalysisPageData(supabaseAuthId: string, jobId: string, config: AiConfig, now = new Date()) {
  const user = await ownerOf(supabaseAuthId);
  const job = user && (await ownedJob(user.id, jobId));
  if (!user || !job) return null;

  const [latest, history, usedToday, profile] = await Promise.all([
    prisma.jobMatchAnalysis.findFirst({
      where: { savedJobId: job.id, userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiAnalysisRun.findMany({
      where: { savedJobId: job.id, userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 10,
      select: { id: true, status: true, provider: true, errorCode: true, startedAt: true, analysis: { select: { verdictCounts: true } } },
    }),
    prisma.aiAnalysisRun.count({ where: { userId: user.id, startedAt: { gt: new Date(now.getTime() - WINDOW_MS) } } }),
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

  return {
    job: { id: job.id, title: job.title, company: job.company },
    readiness: jobReadiness(job),
    latest: view,
    history,
    remainingToday: config.enabled ? Math.max(0, config.dailyLimit - usedToday) : 0,
    dailyLimit: config.enabled ? config.dailyLimit : 0,
    configured: config.enabled,
  };
}
