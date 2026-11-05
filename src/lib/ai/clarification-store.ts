import "server-only";
import type { AiConfig } from "@/lib/ai/config";
import { WINDOW_MS, runJobAnalysis } from "@/lib/ai/analysis";
import { deleteAnswerChain } from "@/lib/ai/answer-deletion";
import { shadowInterpret } from "@/lib/ai/interpretation-shadow";
import { currentMonth, type MatchRequirement, type Verdict } from "@/lib/ai/evidence";
import type { Finding } from "@/lib/ai/match-validation";
import { answerProblem, clarificationFor, entryProblem, type Clarification } from "@/lib/ai/rules/clarifications";
import { prisma } from "@/lib/db";
import type { parseEducation } from "@/lib/education";

// Saves what a person says about a requirement, scoped to the verified user, and asks the rules again.
// Every function takes the id from supabase.auth.getUser(). Re-evaluation is always the rules engine: it
// needs no AI service, and nothing here writes a verdict.

export const CLARIFICATION_DAILY_LIMIT = 30;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type ClarificationError = "not_found" | "not_askable" | "rate_limited" | "invalid" | "save_failed";
/** `after` is null when the save worked but the analysis couldn't be run again right now. */
export type ClarificationResult =
  | { ok: true; before: Verdict; after: Verdict | null; evidenceSources: Finding["evidenceSources"] }
  | { ok: false; error: ClarificationError; message?: string };

type Asked = { userId: string; jobId: string; question: Clarification; finding: Finding };

/** The question must be one the person's own latest analysis actually asks. */
async function askedQuestion(supabaseAuthId: string, analysisId: string, requirementIndex: number): Promise<Asked | ClarificationError> {
  if (!UUID.test(analysisId) || !Number.isSafeInteger(requirementIndex) || requirementIndex < 0) return "not_found";
  const analysis = await prisma.jobMatchAnalysis.findFirst({
    where: { id: analysisId, user: { supabaseAuthId } },
    select: { userId: true, savedJobId: true, requirements: true, findings: true },
  });
  if (!analysis) return "not_found";
  const requirement = (analysis.requirements as MatchRequirement[]).find(r => r.index === requirementIndex);
  const finding = (analysis.findings as Finding[]).find(f => f.requirementIndex === requirementIndex);
  const question = requirement && finding ? clarificationFor(requirement, finding) : null;
  if (!question || !finding) return "not_askable";
  return { userId: analysis.userId, jobId: analysis.savedJobId, question, finding };
}

/** Saving is limited under a per-user lock, so concurrent requests can't get past the limit. */
async function withinLimit<T>(userId: string, now: Date, save: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>): Promise<T | "rate_limited"> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`clarification:${userId}`}, 0))) AS l`;
    const since = new Date(now.getTime() - WINDOW_MS);
    // Deleted answers still count, so deleting can't reset this.
    const used = await tx.candidateClarification.count({ where: { userId, createdAt: { gt: since } } })
      + await tx.clarificationEvent.count({ where: { userId, createdAt: { gt: since }, action: "DELETED" } });
    if (used >= CLARIFICATION_DAILY_LIMIT) return "rate_limited" as const;
    return save(tx);
  }, { maxWait: 10_000, timeout: 10_000 });
}

/** Ask the rules again, and report this requirement's new result. A failure here loses nothing. */
async function reevaluate(supabaseAuthId: string, asked: Asked, config: AiConfig, now: Date): Promise<ClarificationResult> {
  const before = asked.finding.verdict;
  const run = await runJobAnalysis({ supabaseAuthId, jobId: asked.jobId, provider: "rules", config, now }).catch(() => null);
  if (!run?.ok) return { ok: true, before, after: null, evidenceSources: undefined };
  const fresh = await prisma.jobMatchAnalysis.findFirst({ where: { id: run.analysisId, userId: asked.userId }, select: { requirements: true, findings: true } });
  const requirement = (fresh?.requirements as MatchRequirement[] | undefined)?.find(r => r.text.includes(asked.question.requirementText));
  const finding = (fresh?.findings as Finding[] | undefined)?.find(f => f.requirementIndex === requirement?.index);
  return { ok: true, before, after: finding?.verdict ?? null, evidenceSources: finding?.evidenceSources };
}

/** A specific description of work in one of the person's roles, kept apart from what they wrote there. */
export async function addRoleDetail(options: { supabaseAuthId: string; analysisId: string; requirementIndex: number; experienceId: string; detail: string; config: AiConfig; now?: Date }): Promise<ClarificationResult> {
  const now = options.now ?? new Date();
  const asked = await askedQuestion(options.supabaseAuthId, options.analysisId, options.requirementIndex);
  if (typeof asked === "string") return { ok: false, error: asked };
  if (asked.question.kind !== "work_detail") return { ok: false, error: "not_askable" };
  const problem = answerProblem(options.detail, asked.question.requirementText);
  if (problem) return { ok: false, error: "invalid", message: problem };
  if (!UUID.test(options.experienceId)) return { ok: false, error: "not_found" };
  const role = await prisma.professionalExperience.findFirst({ where: { id: options.experienceId, profile: { userId: asked.userId } }, select: { id: true } });
  if (!role) return { ok: false, error: "not_found" };
  const saved = await withinLimit(asked.userId, now, tx => tx.candidateClarification.create({
    data: { userId: asked.userId, savedJobId: asked.jobId, requirementText: asked.question.requirementText.slice(0, 500), outcome: "ROLE_DETAIL_ADDED", experienceId: role.id, detail: options.detail.trim() },
    select: { id: true },
  })).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  const result = await reevaluate(options.supabaseAuthId, asked, options.config, now);
  void shadowInterpret({ config: options.config, userId: asked.userId, clarificationId: saved.id, jobId: asked.jobId, requirementText: asked.question.requirementText, answer: options.detail.trim() });
  return result;
}

/** A credential or qualification the person typed, saved as an ordinary education entry that points here. */
export async function addEducationEntry(options: { supabaseAuthId: string; analysisId: string; requirementIndex: number; entry: ReturnType<typeof parseEducation>; config: AiConfig; now?: Date }): Promise<ClarificationResult> {
  const now = options.now ?? new Date();
  const asked = await askedQuestion(options.supabaseAuthId, options.analysisId, options.requirementIndex);
  if (typeof asked === "string") return { ok: false, error: asked };
  if (asked.question.kind !== "credential" && asked.question.kind !== "education") return { ok: false, error: "not_askable" };
  const problem = entryProblem(options.entry.qualification, currentMonth(now), options.entry.endMonth);
  if (problem) return { ok: false, error: "invalid", message: problem };
  const profile = await prisma.careerProfile.findFirst({ where: { userId: asked.userId }, select: { id: true } });
  if (!profile) return { ok: false, error: "not_found" };
  const saved = await withinLimit(asked.userId, now, async tx => {
    const entry = await tx.education.create({ data: { profileId: profile.id, ...options.entry }, select: { id: true } });
    return tx.candidateClarification.create({
      data: { userId: asked.userId, savedJobId: asked.jobId, requirementText: asked.question.requirementText.slice(0, 500), outcome: "ENTRY_ADDED", educationId: entry.id },
      select: { id: true },
    });
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  return reevaluate(options.supabaseAuthId, asked, options.config, now);
}

/** "No": remembered so the question stops being asked for this job. It changes no verdict and no profile. */
export async function declineClarification(options: { supabaseAuthId: string; analysisId: string; requirementIndex: number; now?: Date }): Promise<{ ok: true } | { ok: false; error: ClarificationError }> {
  const asked = await askedQuestion(options.supabaseAuthId, options.analysisId, options.requirementIndex);
  if (typeof asked === "string") return { ok: false, error: asked };
  const requirementText = asked.question.requirementText.slice(0, 500);
  const saved = await withinLimit(asked.userId, options.now ?? new Date(), async tx => {
    const already = await tx.candidateClarification.findFirst({ where: { userId: asked.userId, savedJobId: asked.jobId, requirementText, outcome: "DECLINED" }, select: { id: true } });
    return already ?? tx.candidateClarification.create({ data: { userId: asked.userId, savedJobId: asked.jobId, requirementText, outcome: "DECLINED" }, select: { id: true } });
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  return saved ? { ok: true } : { ok: false, error: "save_failed" };
}

/** Change what an answer says. It's read again from scratch, like any other answer. */
export async function editRoleDetail(options: { supabaseAuthId: string; clarificationId: string; detail: string; config: AiConfig; now?: Date }): Promise<ClarificationResult> {
  const now = options.now ?? new Date();
  if (!UUID.test(options.clarificationId)) return { ok: false, error: "not_found" };
  const row = await prisma.candidateClarification.findFirst({
    where: { id: options.clarificationId, user: { supabaseAuthId: options.supabaseAuthId }, outcome: "ROLE_DETAIL_ADDED", status: "ACTIVE" },
    select: { id: true, userId: true, savedJobId: true, requirementText: true },
  });
  if (!row) return { ok: false, error: "not_found" };
  const problem = answerProblem(options.detail, row.requirementText);
  if (problem) return { ok: false, error: "invalid", message: problem };
  const saved = await prisma.candidateClarification.update({ where: { id: row.id }, data: { detail: options.detail.trim() }, select: { id: true } }).catch(() => null);
  if (!saved) return { ok: false, error: "save_failed" };
  void shadowInterpret({ config: options.config, userId: row.userId, clarificationId: row.id, jobId: row.savedJobId, requirementText: row.requirementText, answer: options.detail.trim() });
  const run = row.savedJobId ? await runJobAnalysis({ supabaseAuthId: options.supabaseAuthId, jobId: row.savedJobId, provider: "rules", config: options.config, now }).catch(() => null) : null;
  if (!run?.ok) return { ok: true, before: "insufficient_information", after: null, evidenceSources: undefined };
  const fresh = await prisma.jobMatchAnalysis.findFirst({ where: { id: run.analysisId, userId: row.userId }, select: { requirements: true, findings: true } });
  const requirement = (fresh?.requirements as MatchRequirement[] | undefined)?.find(r => r.text.includes(row.requirementText));
  const finding = (fresh?.findings as Finding[] | undefined)?.find(f => f.requirementIndex === requirement?.index);
  return { ok: true, before: "insufficient_information", after: finding?.verdict ?? null, evidenceSources: finding?.evidenceSources };
}

/** Take an answer back, for good: its words, any entry it added, and its stored copies. */
export async function removeClarification(options: { supabaseAuthId: string; clarificationId: string }): Promise<boolean> {
  if (!UUID.test(options.clarificationId)) return false;
  const row = await prisma.candidateClarification.findFirst({ where: { id: options.clarificationId, user: { supabaseAuthId: options.supabaseAuthId } }, select: { id: true, userId: true, questionKey: true } });
  if (!row) return false;
  await deleteAnswerChain(row.userId, row);
  return true;
}
