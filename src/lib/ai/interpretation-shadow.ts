import "server-only";
import type { AiConfig } from "@/lib/ai/config";
import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { callLocalModel, decideInterpretation, INTERPRET_VERSION, type InterpretOutcome } from "@/lib/ai/interpretation";
import type { Finding } from "@/lib/ai/match-validation";
import { RULES_VERSION } from "@/lib/ai/rules/engine";
import { prisma } from "@/lib/db";

// Local shadow testing only, off unless INTERPRETATION_SHADOW_ENABLED is set. After an answer's saved, the
// local model reads it, and what code makes of that is recorded as metadata. It returns nothing, nothing
// reads the record to decide anything, and no person sees it. The record holds no words from the answer:
// only the outcome and its reason, and permanent deletion removes it.

const ACTIONS: Record<InterpretOutcome, string> = { supported_candidate: "SHADOW_SUPPORTED", possible_candidate: "SHADOW_POSSIBLE", follow_up: "SHADOW_FOLLOW_UP", unresolved: "SHADOW_UNRESOLVED" };
const MAX_WAITING = 3;
let tail: Promise<void> = Promise.resolve();
let waiting = 0;

async function interpret(options: ShadowOptions, shadow: { url: string; model: string }) {
  const job = options.jobId ? await prisma.jobMatchAnalysis.findFirst({ where: { userId: options.userId, savedJobId: options.jobId }, orderBy: { createdAt: "desc" }, select: { requirements: true, findings: true } }) : null;
  const requirement = (job?.requirements as MatchRequirement[] | undefined)?.find(r => r.text.includes(options.requirementText)) ?? { index: 0, text: options.requirementText, category: "Skills" as const, priority: "Required" as const };
  const finding = (job?.findings as Finding[] | undefined)?.find(f => f.requirementIndex === requirement.index);
  const rulesOnly: Verdict = finding?.rulesOnlyVerdict ?? finding?.verdict ?? "insufficient_information";
  const call = await callLocalModel(requirement.text, options.answer, { url: shadow.url, model: shadow.model });
  const result = decideInterpretation(requirement, options.answer, rulesOnly, call.raw);
  // The answer may have been deleted while the model was reading it.
  if (!(await prisma.candidateClarification.count({ where: { id: options.clarificationId, userId: options.userId, status: "ACTIVE" } }))) return;
  await prisma.clarificationEvent.create({ data: { userId: options.userId, clarificationId: options.clarificationId, savedJobId: options.jobId, action: ACTIONS[result.outcome], questionKey: result.reason, verdictBefore: rulesOnly, rulesVersion: `${RULES_VERSION}+${INTERPRET_VERSION}` } });
}

export type ShadowOptions = { config: AiConfig; userId: string; clarificationId: string; jobId: string | null; requirementText: string; answer: string };

/** Never throws, never waits for the model when called with `void`, and never changes anything a person sees.
 * One at a time, because the GPU can't do more, and it gives up rather than build a backlog. */
export function shadowInterpret(options: ShadowOptions): Promise<void> {
  const shadow = options.config.enabled ? options.config.interpretationShadow : null;
  if (!shadow || waiting >= MAX_WAITING) return Promise.resolve();
  waiting++;
  tail = tail.then(() => interpret(options, shadow)).catch(() => undefined).finally(() => { waiting--; });
  return tail;
}
