import "server-only";
import { WINDOW_MS, runJobAnalysis } from "@/lib/ai/analysis";
import type { AiConfig } from "@/lib/ai/config";
import { currentMonth, type MatchRequirement, type Verdict } from "@/lib/ai/evidence";
import { deleteAnswerChain } from "@/lib/ai/answer-deletion";
import { shadowInterpret } from "@/lib/ai/interpretation-shadow";
import type { Finding } from "@/lib/ai/match-validation";
import { answerProblem, entryProblem } from "@/lib/ai/rules/clarifications";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { buildReviewQueue, type ReviewQuestion } from "@/lib/ai/rules/review-queue";
import { prisma } from "@/lib/db";
import type { parseEducation } from "@/lib/education";

// Exception review: saving answers, with their source, and re-reading the requirements they touch. Only the
// rules re-read them, so no AI service is involved. Every function takes the id from supabase.auth.getUser().

export const ANSWER_DAILY_LIMIT = 30;
/** Corrections are counted apart, so someone at the limit can still fix a mistake. Revoking and deleting
 * are never limited. This only stops a script from rewriting answers without end. */
export const CORRECTION_DAILY_LIMIT = 30;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type ReviewError = "not_found" | "not_askable" | "rate_limited" | "invalid" | "save_failed" | "disabled";
export type ReviewResult = { ok: true; changes: { text: string; before: Verdict; after: Verdict | null }[] } | { ok: false; error: ReviewError; message?: string };
type Scope = { supabaseAuthId: string; config: AiConfig; now?: Date };
type Asked = { userId: string; jobId: string; requirement: MatchRequirement; finding: Finding; key: string; keys: string[]; kind: ReviewQuestion["kind"]; related: { requirement: MatchRequirement; finding: Finding }[] };

async function asked(options: Scope & { analysisId: string; questionKey: string }): Promise<Asked | ReviewError> {
  if (!options.config.reviewEnabled) return "disabled";
  if (!UUID.test(options.analysisId)) return "not_found";
  const analysis = await prisma.jobMatchAnalysis.findFirst({
    where: { id: options.analysisId, user: { supabaseAuthId: options.supabaseAuthId } },
    select: { userId: true, savedJobId: true, requirements: true, findings: true },
  });
  if (!analysis) return "not_found";
  const requirements = analysis.requirements as MatchRequirement[];
  const findings = analysis.findings as Finding[];
  // The question must be one this analysis really asks, read with nothing suppressed.
  const question = buildReviewQueue(requirements, findings, new Set(), new Set(), Number.MAX_SAFE_INTEGER).questions.find(q => q.keys.includes(options.questionKey));
  if (!question) return "not_askable";
  const related = question.requirementIndexes.map(index => ({ requirement: requirements.find(r => r.index === index)!, finding: findings.find(f => f.requirementIndex === index)! }));
  return { userId: analysis.userId, jobId: analysis.savedJobId, requirement: related[0].requirement, finding: related[0].finding, key: question.key, keys: question.keys, kind: question.kind, related };
}

/** Limits count events, which outlive a deleted answer, so deleting can't reset them. */
async function withinLimit<T>(userId: string, now: Date, kind: "answer" | "correction", save: (tx: Tx) => Promise<T>): Promise<T | "rate_limited"> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`clarification:${userId}`}, 0))) AS l`;
    const used = await tx.clarificationEvent.count({
      where: { userId, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) }, action: kind === "correction" ? "CORRECTED" : { in: ["CONFIRMED", "DENIED", "SKIPPED"] } },
    });
    if (used >= (kind === "correction" ? CORRECTION_DAILY_LIMIT : ANSWER_DAILY_LIMIT)) return "rate_limited" as const;
    return save(tx);
  }, { maxWait: 10_000, timeout: 10_000 });
}

const event = (tx: Tx, data: { userId: string; clarificationId: string | null; savedJobId: string | null; action: string; questionKey: string | null; requirementText: string | null; verdictBefore?: string | null; verdictAfter?: string | null }) =>
  tx.clarificationEvent.create({ data: { ...data, rulesVersion: RULES_VERSION } });

/** Run the rules again and record what changed. A failure here loses nothing: the answer is already saved. */
async function recheck(options: Scope, userId: string, jobId: string, clarificationId: string | null, key: string | null, action: string): Promise<ReviewResult> {
  const before = await prisma.jobMatchAnalysis.findFirst({ where: { userId, savedJobId: jobId }, orderBy: { createdAt: "desc" }, select: { requirements: true, findings: true } });
  const run = await runJobAnalysis({ supabaseAuthId: options.supabaseAuthId, jobId, provider: "rules", config: options.config, now: options.now, recheck: true }).catch(() => null);
  if (!run?.ok) return { ok: true, changes: [] };
  const after = await prisma.jobMatchAnalysis.findFirst({ where: { id: run.analysisId, userId }, select: { requirements: true, findings: true } });
  const changes: { text: string; before: Verdict; after: Verdict | null }[] = [];
  const beforeFindings = (before?.findings ?? []) as Finding[];
  const beforeRequirements = (before?.requirements ?? []) as MatchRequirement[];
  for (const f of (after?.findings ?? []) as Finding[]) {
    const text = ((after?.requirements ?? []) as MatchRequirement[]).find(r => r.index === f.requirementIndex)?.text;
    const was = beforeFindings.find(x => beforeRequirements.find(r => r.index === x.requirementIndex)?.text === text);
    if (text && was && was.verdict !== f.verdict) {
      changes.push({ text, before: was.verdict, after: f.verdict });
      await prisma.clarificationEvent.create({ data: { userId, clarificationId, savedJobId: jobId, action: `${action}_RESULT`, questionKey: key, requirementText: text.slice(0, 500), verdictBefore: was.verdict, verdictAfter: f.verdict, rulesVersion: RULES_VERSION } });
    }
  }
  return { ok: true, changes };
}

/** One active answer per question: a newer answer replaces whatever was there. */
async function retireCurrent(tx: Tx, userId: string, keys: string[]): Promise<string | null> {
  const current = await tx.candidateClarification.findFirst({ where: { userId, questionKey: { in: keys }, status: "ACTIVE", outcome: { in: ["ROLE_DETAIL_ADDED", "ENTRY_ADDED", "DENIED"] } }, select: { id: true, educationId: true, outcome: true } });
  if (!current) return null;
  await tx.candidateClarification.update({ where: { id: current.id }, data: { status: "SUPERSEDED", educationId: null } });
  if (current.educationId) await tx.education.deleteMany({ where: { id: current.educationId, profile: { userId } } });
  return current.id;
}

export async function confirmWithDetail(options: Scope & { analysisId: string; questionKey: string; experienceId: string; detail: string }): Promise<ReviewResult> {
  const now = options.now ?? new Date();
  const question = await asked(options);
  if (typeof question === "string") return { ok: false, error: question };
  if (question.kind !== "work_detail") return { ok: false, error: "not_askable" };
  const problem = answerProblem(options.detail, question.related.map(r => r.requirement.text).join(" "));
  if (problem) return { ok: false, error: "invalid", message: problem };
  if (!UUID.test(options.experienceId)) return { ok: false, error: "not_found" };
  const role = await prisma.professionalExperience.findFirst({ where: { id: options.experienceId, profile: { userId: question.userId } }, select: { id: true } });
  if (!role) return { ok: false, error: "not_found" };
  const saved = await withinLimit(question.userId, now, "answer", async tx => {
    const supersedesId = await retireCurrent(tx, question.userId, question.keys);
    const row = await tx.candidateClarification.create({
      data: { userId: question.userId, savedJobId: question.jobId, requirementText: question.requirement.text.slice(0, 500), outcome: "ROLE_DETAIL_ADDED", experienceId: role.id, detail: options.detail.trim(), questionKey: question.key, coveredKeys: question.keys, supersedesId },
      select: { id: true },
    });
    await tx.candidateClarification.update({ where: { id: row.id }, data: { evidenceId: `experience:${row.id}` } });
    await event(tx, { userId: question.userId, clarificationId: row.id, savedJobId: question.jobId, action: "CONFIRMED", questionKey: question.key, requirementText: question.requirement.text.slice(0, 500), verdictBefore: question.finding.verdict });
    return row;
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  const checked = await recheck(options, question.userId, question.jobId, saved.id, question.key, "CONFIRMED");
  void shadowInterpret({ config: options.config, userId: question.userId, clarificationId: saved.id, jobId: question.jobId, requirementText: question.requirement.text, answer: options.detail.trim() });
  return checked;
}

export async function confirmWithEntry(options: Scope & { analysisId: string; questionKey: string; entry: ReturnType<typeof parseEducation> }): Promise<ReviewResult> {
  const now = options.now ?? new Date();
  const question = await asked(options);
  if (typeof question === "string") return { ok: false, error: question };
  if (question.kind !== "credential" && question.kind !== "education") return { ok: false, error: "not_askable" };
  const problem = entryProblem(options.entry.qualification, currentMonth(now), options.entry.endMonth);
  if (problem) return { ok: false, error: "invalid", message: problem };
  const profile = await prisma.careerProfile.findFirst({ where: { userId: question.userId }, select: { id: true } });
  if (!profile) return { ok: false, error: "not_found" };
  const saved = await withinLimit(question.userId, now, "answer", async tx => {
    const supersedesId = await retireCurrent(tx, question.userId, question.keys);
    const entry = await tx.education.create({ data: { profileId: profile.id, ...options.entry }, select: { id: true } });
    const row = await tx.candidateClarification.create({
      data: { userId: question.userId, savedJobId: question.jobId, requirementText: question.requirement.text.slice(0, 500), outcome: "ENTRY_ADDED", educationId: entry.id, questionKey: question.key, coveredKeys: question.keys, supersedesId, evidenceId: `education:${entry.id}` },
      select: { id: true },
    });
    await event(tx, { userId: question.userId, clarificationId: row.id, savedJobId: question.jobId, action: "CONFIRMED", questionKey: question.key, requirementText: question.requirement.text.slice(0, 500), verdictBefore: question.finding.verdict });
    return row;
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  return recheck(options, question.userId, question.jobId, saved.id, question.key, "CONFIRMED");
}

export async function denyQuestion(options: Scope & { analysisId: string; questionKey: string }): Promise<ReviewResult> {
  const now = options.now ?? new Date();
  const question = await asked(options);
  if (typeof question === "string") return { ok: false, error: question };
  const saved = await withinLimit(question.userId, now, "answer", async tx => {
    const supersedesId = await retireCurrent(tx, question.userId, question.keys);
    const row = await tx.candidateClarification.create({ data: { userId: question.userId, savedJobId: question.jobId, requirementText: question.requirement.text.slice(0, 500), outcome: "DENIED", questionKey: question.key, coveredKeys: question.keys, supersedesId }, select: { id: true } });
    await event(tx, { userId: question.userId, clarificationId: row.id, savedJobId: question.jobId, action: "DENIED", questionKey: question.key, requirementText: question.requirement.text.slice(0, 500), verdictBefore: question.finding.verdict });
    return row;
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  return recheck(options, question.userId, question.jobId, saved.id, question.key, "DENIED");
}

/** Not again for this job. It changes no verdict and adds no evidence. */
export async function skipQuestion(options: Scope & { analysisId: string; questionKey: string }): Promise<{ ok: true } | { ok: false; error: ReviewError }> {
  const now = options.now ?? new Date();
  const question = await asked(options);
  if (typeof question === "string") return { ok: false, error: question };
  const saved = await withinLimit(question.userId, now, "answer", async tx => {
    const row = await tx.candidateClarification.create({ data: { userId: question.userId, savedJobId: question.jobId, requirementText: question.requirement.text.slice(0, 500), outcome: "SKIPPED", questionKey: question.key }, select: { id: true } });
    await event(tx, { userId: question.userId, clarificationId: row.id, savedJobId: question.jobId, action: "SKIPPED", questionKey: question.key, requirementText: question.requirement.text.slice(0, 500) });
    return row;
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  return saved ? { ok: true } : { ok: false, error: "save_failed" };
}

async function ownedAnswer(options: Scope & { clarificationId: string }) {
  if (!options.config.reviewEnabled || !UUID.test(options.clarificationId)) return null;
  return prisma.candidateClarification.findFirst({ where: { id: options.clarificationId, user: { supabaseAuthId: options.supabaseAuthId } } });
}

/** Replaces an answer's words. The earlier version is kept, marked superseded, until it's deleted. */
export async function correctAnswer(options: Scope & { clarificationId: string; detail: string }): Promise<ReviewResult> {
  const now = options.now ?? new Date();
  const old = await ownedAnswer(options);
  if (!old || old.status !== "ACTIVE" || old.outcome !== "ROLE_DETAIL_ADDED" || !old.experienceId) return { ok: false, error: "not_found" };
  const problem = answerProblem(options.detail, old.requirementText);
  if (problem) return { ok: false, error: "invalid", message: problem };
  const saved = await withinLimit(old.userId, now, "correction", async tx => {
    await tx.candidateClarification.update({ where: { id: old.id }, data: { status: "SUPERSEDED" } });
    const row = await tx.candidateClarification.create({
      data: { userId: old.userId, savedJobId: old.savedJobId, requirementText: old.requirementText, outcome: "ROLE_DETAIL_ADDED", experienceId: old.experienceId!, detail: options.detail.trim(), questionKey: old.questionKey, coveredKeys: old.coveredKeys, supersedesId: old.id },
      select: { id: true },
    });
    await tx.candidateClarification.update({ where: { id: row.id }, data: { evidenceId: `experience:${row.id}` } });
    await event(tx, { userId: old.userId, clarificationId: row.id, savedJobId: old.savedJobId, action: "CORRECTED", questionKey: old.questionKey, requirementText: old.requirementText });
    return row;
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  const checked: ReviewResult = old.savedJobId ? await recheck(options, old.userId, old.savedJobId, saved.id, old.questionKey, "CORRECTED") : { ok: true, changes: [] };
  void shadowInterpret({ config: options.config, userId: old.userId, clarificationId: saved.id, jobId: old.savedJobId, requirementText: old.requirementText, answer: options.detail.trim() });
  return checked;
}

/** Stops counting at once, everywhere: evidence reads active answers only, and stored results citing it are
 * masked until they're run again. Never limited. The text stays until it's permanently deleted. */
export async function revokeAnswer(options: Scope & { clarificationId: string }): Promise<ReviewResult> {
  const old = await ownedAnswer(options);
  if (!old || old.status === "REVOKED") return { ok: false, error: "not_found" };
  await prisma.$transaction(async tx => {
    await tx.candidateClarification.update({ where: { id: old.id }, data: { status: "REVOKED", revokedAt: options.now ?? new Date(), educationId: null } });
    if (old.educationId) await tx.education.deleteMany({ where: { id: old.educationId, profile: { userId: old.userId } } });
    await event(tx, { userId: old.userId, clarificationId: old.id, savedJobId: old.savedJobId, action: "REVOKED", questionKey: old.questionKey, requirementText: old.requirementText });
  });
  return old.savedJobId ? recheck(options, old.userId, old.savedJobId, old.id, old.questionKey, "REVOKED") : { ok: true, changes: [] };
}

/** Removes an answer's words and every stored copy of them. See answer-deletion.ts. */
export async function deleteAnswerPermanently(options: Scope & { clarificationId: string }): Promise<boolean> {
  const first = await ownedAnswer(options);
  if (!first) return false;
  await deleteAnswerChain(first.userId, first);
  return true;
}
