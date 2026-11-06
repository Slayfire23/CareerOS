import "server-only";
import { WINDOW_MS } from "@/lib/ai/analysis";
import { purgeFollowUpReply } from "@/lib/ai/answer-deletion";
import type { AiConfig } from "@/lib/ai/config";
import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { callLocalModel, decideInterpretation } from "@/lib/ai/interpretation";
import type { Finding } from "@/lib/ai/match-validation";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { followUpNeed, readFollowUpReply, REPLY_NOTES, type ReplyReason } from "@/lib/ai/rules/follow-up-reply";
import { prisma } from "@/lib/db";

// Local testing only, behind FOLLOW_UP_WORKFLOW_ENABLED. After an answer is saved and the rules have read it,
// the local model may suggest asking about work it thinks is related. Code decides whether to ask, code reads
// the reply, and a reply reaches Possible — Self-reported at most. The model never sees the reply and never
// sets a verdict. If it can't be reached, the answer stays unresolved, and the person is told.

export const MAX_OPEN_PER_JOB = 3;
export const FOLLOW_UP_DAILY_LIMIT = 30;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Scope = { supabaseAuthId: string; config: AiConfig; now?: Date };
type Recheck = (options: Scope, userId: string, jobId: string, clarificationId: string | null, key: string | null, action: string) => Promise<unknown>;

const event = (userId: string, clarificationId: string | null, savedJobId: string | null, action: string, questionKey: string | null) =>
  prisma.clarificationEvent.create({ data: { userId, clarificationId, savedJobId, action, questionKey, rulesVersion: RULES_VERSION } });

export type ProposeOutcome = "proposed" | "none" | "unavailable";

/** Runs after the rules have re-read an answer. Asks at most once about a requirement or the same words. */
export async function proposeFollowUp(options: { config: AiConfig; userId: string; clarificationId: string; jobId: string | null; questionKey: string; requirementText: string; answer: string; fetchImpl?: typeof fetch }): Promise<ProposeOutcome> {
  const shadow = options.config.enabled ? options.config.followUp : null;
  if (!shadow || !options.jobId) return "none";
  const parent = await prisma.candidateClarification.findFirst({ where: { id: options.clarificationId, userId: options.userId, status: "ACTIVE", outcome: "ROLE_DETAIL_ADDED" }, select: { experienceId: true } });
  if (!parent?.experienceId) return "none";
  const earlier = await prisma.clarificationFollowUp.findMany({ where: { userId: options.userId }, select: { questionKey: true, status: true, savedJobId: true, quoteStart: true, quoteEnd: true, clarification: { select: { detail: true } } } });
  if (earlier.some(f => f.questionKey === options.questionKey)) return "none";
  if (earlier.filter(f => f.savedJobId === options.jobId && f.status === "PROPOSED").length >= MAX_OPEN_PER_JOB) return "none";

  const job = await prisma.jobMatchAnalysis.findFirst({ where: { userId: options.userId, savedJobId: options.jobId }, orderBy: { createdAt: "desc" }, select: { requirements: true, findings: true } });
  const requirement = (job?.requirements as MatchRequirement[] | undefined)?.find(r => r.text.includes(options.requirementText));
  const finding = (job?.findings as Finding[] | undefined)?.find(f => f.requirementIndex === requirement?.index);
  if (!requirement || !finding) return "none";
  const rulesOnly: Verdict = finding.verdict;
  if (rulesOnly !== "insufficient_information") return "none"; // The rules read it already.

  // Code asks first, without the model, when who did it or the person's part isn't plain. Only otherwise may the model
  // suggest asking about related work.
  const need = followUpNeed(requirement, options.answer);
  let followUpSpan = need ? { start: need.start, end: need.end } : null;
  if (!followUpSpan) {
    const call = await callLocalModel(requirement.text, options.answer, { url: shadow.url, model: shadow.model, fetchImpl: options.fetchImpl });
    const result = decideInterpretation(requirement, options.answer, rulesOnly, call.raw);
    if (result.reason === "model_unavailable" || result.reason === "output_rejected") {
      await event(options.userId, options.clarificationId, options.jobId, "FU_UNAVAILABLE", options.questionKey);
      return "unavailable";
    }
    if (result.outcome !== "follow_up" || !result.followUpSpan) return "none";
    followUpSpan = result.followUpSpan;
  }
  // The same words on another requirement aren't asked about a second time.
  const quote = options.answer.slice(followUpSpan.start, followUpSpan.end);
  if (earlier.some(f => f.clarification.detail?.slice(f.quoteStart, f.quoteEnd) === quote)) return "none";
  // The answer may have gone while the model was reading it.
  if (!(await prisma.candidateClarification.count({ where: { id: options.clarificationId, userId: options.userId, status: "ACTIVE" } }))) return "none";
  const created = await prisma.clarificationFollowUp.createMany({
    data: [{ userId: options.userId, clarificationId: options.clarificationId, savedJobId: options.jobId, experienceId: parent.experienceId, questionKey: options.questionKey, requirementText: requirement.text.slice(0, 500), quoteStart: followUpSpan.start, quoteEnd: followUpSpan.end }],
    skipDuplicates: true,
  });
  if (!created.count) return "none";
  await event(options.userId, options.clarificationId, options.jobId, "FU_PROPOSED", options.questionKey);
  return "proposed";
}

async function owned(options: Scope & { followUpId: string }) {
  if (!options.config.enabled || !options.config.followUp || !UUID.test(options.followUpId)) return null;
  return prisma.clarificationFollowUp.findFirst({
    where: { id: options.followUpId, user: { supabaseAuthId: options.supabaseAuthId } },
    include: { clarification: { select: { detail: true, status: true } } },
  });
}

export type FollowUpResult = { ok: true; note: string; changes: unknown } | { ok: false; error: "not_found" | "rate_limited" | "invalid" | "save_failed"; message?: string };
const AT_THE_DOOR: ReplyReason[] = ["not_specific", "instruction_in_reply", "repeats_the_question", "says_no"];
const REFUSALS: Partial<Record<ReplyReason, string>> = {
  not_specific: "Say what you personally did: the task, what you worked on, and for whom or how often. A yes alone can't be used.",
  instruction_in_reply: "Describe only your own work. Remarks about how this should be judged can't be used.",
  repeats_the_question: "Add what you did, in your own words, instead of repeating the question.",
  says_no: "If this is different work, choose No.",
};

/** Answers the question, or edits an earlier reply. Refused text isn't saved, and stays in the form. */
export async function replyToFollowUp(options: Scope & { followUpId: string; detail: string; recheck: Recheck }): Promise<FollowUpResult> {
  const now = options.now ?? new Date();
  const row = await owned(options);
  if (!row || !["PROPOSED", "ANSWERED"].includes(row.status) || row.clarification.status !== "ACTIVE" || !row.clarification.detail) return { ok: false, error: "not_found" };
  const quoted = row.clarification.detail.slice(row.quoteStart, row.quoteEnd);
  const detail = options.detail.trim();
  const requirement: MatchRequirement = { index: 0, text: row.requirementText, category: "Skills", priority: "Required" };
  const reading = readFollowUpReply(requirement, quoted, detail, row.clarification.detail);
  if (AT_THE_DOOR.includes(reading.reason)) return { ok: false, error: "invalid", message: REFUSALS[reading.reason] };
  const action = row.status === "ANSWERED" ? "FU_EDITED" : "FU_ANSWERED";
  const saved = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`clarification:${row.userId}`}, 0))) AS l`;
    const used = await tx.clarificationEvent.count({ where: { userId: row.userId, action, createdAt: { gt: new Date(now.getTime() - WINDOW_MS) } } });
    if (used >= FOLLOW_UP_DAILY_LIMIT) return "rate_limited" as const;
    await tx.clarificationFollowUp.update({ where: { id: row.id }, data: { detail, status: "ANSWERED" } });
    await tx.clarificationEvent.create({ data: { userId: row.userId, clarificationId: row.clarificationId, savedJobId: row.savedJobId, action, questionKey: row.questionKey, rulesVersion: RULES_VERSION } });
    return "saved" as const;
  }).catch(() => null);
  if (saved === "rate_limited") return { ok: false, error: "rate_limited" };
  if (!saved) return { ok: false, error: "save_failed" };
  const changes = row.savedJobId ? await options.recheck(options, row.userId, row.savedJobId, row.clarificationId, row.questionKey, "FU_REPLY") : null;
  return { ok: true, note: REPLY_NOTES[reading.reason], changes };
}

/** No or Skip: nothing else changes, and it isn't asked again. A No here isn't saying they lack the skill. */
export async function closeFollowUp(options: Scope & { followUpId: string; action: "deny" | "skip"; recheck: Recheck }): Promise<FollowUpResult> {
  const row = await owned(options);
  if (!row || !["PROPOSED", "ANSWERED"].includes(row.status)) return { ok: false, error: "not_found" };
  const wasAnswered = row.status === "ANSWERED";
  await prisma.clarificationFollowUp.update({ where: { id: row.id }, data: { status: options.action === "deny" ? "DENIED" : "SKIPPED", detail: null } });
  await event(row.userId, row.clarificationId, row.savedJobId, options.action === "deny" ? "FU_DENIED" : "FU_SKIPPED", row.questionKey);
  const changes = wasAnswered && row.savedJobId ? await options.recheck(options, row.userId, row.savedJobId, row.clarificationId, row.questionKey, "FU_REPLY") : null;
  return { ok: true, note: options.action === "deny" ? "Noted. This won't be asked again, and it stays unresolved." : "Skipped. This won't be asked again.", changes };
}

/** Stops counting at once. The words stay, hidden, until deleted. */
export async function revokeFollowUp(options: Scope & { followUpId: string; recheck: Recheck }): Promise<FollowUpResult> {
  const row = await owned(options);
  if (!row || row.status !== "ANSWERED") return { ok: false, error: "not_found" };
  await prisma.clarificationFollowUp.update({ where: { id: row.id }, data: { status: "REVOKED" } });
  await event(row.userId, row.clarificationId, row.savedJobId, "FU_REVOKED", row.questionKey);
  const changes = row.savedJobId ? await options.recheck(options, row.userId, row.savedJobId, row.clarificationId, row.questionKey, "FU_REPLY") : null;
  return { ok: true, note: "Revoked. It no longer counts.", changes };
}

/** Removes the reply's words and every stored copy. The question doesn't come back. */
export async function deleteFollowUpReply(options: Scope & { followUpId: string }): Promise<boolean> {
  const row = await owned(options);
  if (!row) return false;
  await prisma.$transaction(tx => purgeFollowUpReply(tx, row.userId, row));
  return true;
}
