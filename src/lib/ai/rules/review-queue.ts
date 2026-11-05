import { createHash } from "node:crypto";
import type { MatchRequirement } from "@/lib/ai/evidence";
import type { Finding } from "@/lib/ai/match-validation";
import { groupsFor, needsCredentialEntry, specificTerms } from "@/lib/ai/rules/answer-review";
import { clarificationFor, type Clarification, type ClarificationKind } from "@/lib/ai/rules/clarifications";
import { gradeTokens } from "@/lib/ai/rules/engine";
import { VOCABULARY, canonicalTerms } from "@/lib/ai/skill-relations";
import { qualificationText } from "@/lib/ai/untrusted-text";

// Which questions to ask about one job's analysis. Pure, and rules only. Settled requirements never appear,
// a question answered on any job doesn't come back, and at most a few are shown, most useful first.

export const MAX_QUESTIONS = 5;

/** The kind of question for a review. Naming a credential's subject ("Forklift operation") asks about work. */
export function reviewKind(requirement: MatchRequirement, clarification: Clarification): ClarificationKind {
  if (clarification.kind === "credential" && !needsCredentialEntry(qualificationText(requirement.text))) return "work_detail";
  return clarification.kind;
}

/** Stays the same however a reviewed name writes it: Phlebotomy and Venipuncture are one question, while
 * CDL Class A and CDL Class B are two. */
export function questionKey(requirementText: string, kind: ClarificationKind): string {
  const text = qualificationText(requirementText);
  const reviewed = groupsFor(text);
  const terms = reviewed.length ? reviewed.map(g => g.canonical) : specificTerms(text);
  const grades = gradeTokens(text);
  const family = kind === "credential" || kind === "education" ? kind : kind === "employment" ? "employment" : "work";
  return createHash("sha256").update(`${family}\u0000${[...new Set(terms)].sort().join("\u0001")}\u0000${grades.join("\u0001")}`, "utf8").digest("hex").slice(0, 32);
}

/** The key for a requirement, as the queue would compute it: the same however its finding reads. */
export function keyForRequirement(requirement: MatchRequirement): string {
  const open: Finding = { requirementIndex: requirement.index, verdict: "insufficient_information", explanation: "", citations: [], caveats: [] };
  const clarification = clarificationFor(requirement, open);
  return questionKey(requirement.text, clarification ? reviewKind(requirement, clarification) : "work_detail");
}

export type ReviewQuestion = {
  key: string;
  /** Every requirement's own key, when one question covers several. */
  keys: string[];
  kind: ClarificationKind;
  requirementIndexes: number[];
  requirementTexts: string[];
  why: string;
  question: string;
  priority: "Required" | "Preferred" | "Unspecified";
};
export type ReviewQueue = { questions: ReviewQuestion[]; notShown: number; settled: number; total: number; suppressedByEarlierAnswers: number };

const COMMON_FIRST_WORDS = new Set("patient customer client project data team quality office staff sales account budget food safety legal medical technical general field".split(" "));
/** A specific named thing two requirements share, so one question can cover them ("Epic EHR", "Epic charting"). */
function sharedThing(a: string, b: string): boolean {
  const named = (text: string) => [...canonicalTerms(text)].filter(t => VOCABULARY.has(t));
  if (named(a).some(t => named(b).includes(t))) return true;
  const first = (text: string) => text.trim().split(/\s+/)[0] ?? "";
  const [fa, fb] = [first(a), first(b)];
  return fa === fb && /^\p{Lu}/u.test(fa) && fa.length > 2 && !COMMON_FIRST_WORDS.has(fa.toLowerCase());
}

const QUESTION: Partial<Record<ClarificationKind, (asked: string) => string>> = {
  work_detail: asked => `Have you done this in a job: ${asked}? If so, which role, and what did you do?`,
};
const asList = (texts: string[]) => texts.map(t => `“${t}”`).join(texts.length === 2 ? " and " : ", ");

const rank = (q: ReviewQuestion) => (q.priority === "Required" ? 0 : 10) + (q.kind === "credential" || q.kind === "education" ? 0 : q.kind === "work_detail" ? 1 : 3) - q.requirementIndexes.length * 0.1;

/** `answered`: keys with an active answer, from any job. `skipped`: keys skipped for this job. */
export function buildReviewQueue(requirements: MatchRequirement[], findings: Finding[], answered: ReadonlySet<string>, skipped: ReadonlySet<string>, limit = MAX_QUESTIONS): ReviewQueue {
  const open: ReviewQuestion[] = [];
  let suppressed = 0;
  for (const finding of findings) {
    const requirement = requirements.find(r => r.index === finding.requirementIndex);
    const clarification = requirement && clarificationFor(requirement, finding);
    if (!requirement || !clarification) continue;
    const kind = reviewKind(requirement, clarification);
    const key = questionKey(requirement.text, kind);
    if (answered.has(key)) {
      suppressed++;
      continue;
    }
    if (skipped.has(key)) continue;
    const same = open.find(q => q.key === key || (q.kind === kind && kind === "work_detail" && sharedThing(q.requirementTexts[0], clarification.requirementText)));
    if (same) {
      if (!same.keys.includes(key)) same.keys.push(key);
      same.requirementIndexes.push(requirement.index);
      same.requirementTexts.push(clarification.requirementText);
      if (requirement.priority === "Required") same.priority = "Required";
      continue;
    }
    open.push({ key, keys: [key], kind, requirementIndexes: [requirement.index], requirementTexts: [clarification.requirementText], why: clarification.why, question: clarification.question, priority: requirement.priority });
  }
  for (const q of open) {
    const write = QUESTION[q.kind];
    if (write) q.question = write(asList(q.requirementTexts));
  }
  const ordered = open.sort((a, b) => rank(a) - rank(b));
  const settled = findings.filter(f => f.verdict === "supported" || f.verdict === "gap").length;
  return { questions: ordered.slice(0, limit), notShown: Math.max(0, ordered.length - limit), settled, total: findings.length, suppressedByEarlierAnswers: suppressed };
}
