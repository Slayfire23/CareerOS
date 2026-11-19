import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import type { Finding } from "@/lib/ai/match-validation";

// V1 (owner decision D4): the person's decision on each requirement, and the snapshot an approval stores. Pure: no I/O.
//
// Decisions come from what the app already records: Agree/Disagree on a finding (feedback), and the review's answers,
// denials and skips (or, in basic mode, answers and "No"). Nothing here computes a verdict. CareerOS's verdict stays the
// rules' verdict, and the person's decision can only LOWER what is recorded as claimed ("not claimed", "denied"). Agreeing
// with a finding, or disputing one, never raises it: Supported comes only from the rules reading specific evidence.

export type RequirementDecision =
  | "confirmed" // agrees with a finding that gives credit, or accepts one that doesn't
  | "not_claimed" // disagrees with a finding that gives credit: the person doesn't claim it
  | "disputed" // disagrees with a finding that gives no credit, without adding anything (recorded; changes nothing)
  | "answered" // added experience or an entry for it (the rules read it in a recalculation)
  | "denied" // said they don't have it
  | "skipped"; // chose to skip it

export type FeedbackEntry = { choice: "agree" | "disagree"; note: string | null };

export type DecisionInputs = {
  /** The analysis' feedback, keyed by requirement index. */
  feedback: Readonly<Record<string, FeedbackEntry | undefined>>;
  /** Review mode: question keys with an active answer, an active denial, or a skip for this job. */
  answeredKeys: ReadonlySet<string>;
  deniedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  /** Basic mode: requirement texts with an active answer, or a "No" for this job. */
  answeredTexts: ReadonlySet<string>;
  declinedTexts: ReadonlySet<string>;
};

const credits = (verdict: Verdict) => verdict === "supported" || verdict === "possible";

/** The person's decision on one requirement, or null when there is none yet. Feedback (an explicit choice on the finding
 * itself) comes first; otherwise the answer, denial or skip for it. */
export function decisionFor(requirement: MatchRequirement, finding: Finding, inputs: DecisionInputs, keyFor: (r: MatchRequirement) => string): RequirementDecision | null {
  const feedback = inputs.feedback[String(requirement.index)];
  if (feedback?.choice === "agree") return "confirmed";
  if (feedback?.choice === "disagree") return credits(finding.verdict) ? "not_claimed" : "disputed";
  const key = keyFor(requirement);
  const text = requirement.text.trim().toLowerCase();
  if (inputs.deniedKeys.has(key) || inputs.declinedTexts.has(text)) return "denied";
  if (inputs.answeredKeys.has(key) || inputs.answeredTexts.has(text)) return "answered";
  if (inputs.skippedKeys.has(key)) return "skipped";
  return null;
}

export type ApprovedEntry = {
  index: number;
  requirement: string;
  category: string;
  priority: string;
  /** CareerOS's (the rules') verdict and basis, as computed. Never changed by the person. */
  verdict: Verdict;
  basis: string | null;
  evidenceIds: string[];
  decision: RequirementDecision;
  note: string | null;
  /** What the approval records as claimed: the verdict, or "not_claimed" when the person withdrew it. Never higher than
   * the verdict. */
  recorded: Verdict | "not_claimed";
};

export type AssessmentSnapshot = {
  entries: ApprovedEntry[];
  /** Requirement indexes still without a decision. */
  undecided: number[];
  summary: { recorded: Record<Verdict | "not_claimed", number>; decisions: Record<RequirementDecision, number>; total: number };
};

const VERDICTS: (Verdict | "not_claimed")[] = ["supported", "possible", "insufficient_information", "gap", "not_claimed"];
const DECISIONS: RequirementDecision[] = ["confirmed", "not_claimed", "disputed", "answered", "denied", "skipped"];

export function assessmentSnapshot(view: { requirements: MatchRequirement[]; findings: Finding[] }, inputs: DecisionInputs, keyFor: (r: MatchRequirement) => string): AssessmentSnapshot {
  const entries: ApprovedEntry[] = [];
  const undecided: number[] = [];
  for (const requirement of view.requirements) {
    const finding = view.findings.find(f => f.requirementIndex === requirement.index);
    if (!finding) { undecided.push(requirement.index); continue; }
    const decision = decisionFor(requirement, finding, inputs, keyFor);
    if (!decision) { undecided.push(requirement.index); continue; }
    entries.push({
      index: requirement.index,
      requirement: requirement.text,
      category: requirement.category,
      priority: requirement.priority,
      verdict: finding.verdict,
      basis: finding.basis ?? null,
      evidenceIds: finding.citations.map(c => c.evidenceId),
      decision,
      note: inputs.feedback[String(requirement.index)]?.note ?? null,
      recorded: decision === "not_claimed" || decision === "denied" ? "not_claimed" : finding.verdict,
    });
  }
  const recorded = Object.fromEntries(VERDICTS.map(v => [v, entries.filter(e => e.recorded === v).length])) as AssessmentSnapshot["summary"]["recorded"];
  const decisions = Object.fromEntries(DECISIONS.map(d => [d, entries.filter(e => e.decision === d).length])) as AssessmentSnapshot["summary"]["decisions"];
  return { entries, undecided, summary: { recorded, decisions, total: view.requirements.length } };
}

export type ApprovalCheck = {
  latestId: string | null;
  analysisId: string;
  outOfDate: { requirements: boolean; profile: boolean; rules: boolean };
  feedbackVersion: number;
  seenFeedbackVersion: number;
  undecided: number;
  total: number;
};

/** Why an approval is refused, or null. Stale, incomplete or changed assessments can't be approved. */
export function approvalRefusal(c: ApprovalCheck): "not_latest" | "out_of_date" | "changed" | "undecided" | "empty" | null {
  if (!c.latestId || c.latestId !== c.analysisId) return "not_latest";
  if (c.outOfDate.requirements || c.outOfDate.profile || c.outOfDate.rules) return "out_of_date";
  if (c.feedbackVersion !== c.seenFeedbackVersion) return "changed";
  if (c.total === 0) return "empty";
  if (c.undecided > 0) return "undecided";
  return null;
}

/** Decisions carried to a recalculated analysis: only for a requirement with the same text whose result (verdict and
 * basis) didn't change. A changed result needs a new decision. */
export function carriedFeedback(previous: { requirements: MatchRequirement[]; findings: Finding[]; feedback: Record<string, unknown> }, next: { requirements: MatchRequirement[]; findings: Finding[] }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const requirement of next.requirements) {
    const before = previous.requirements.find(r => r.text === requirement.text && r.category === requirement.category);
    if (!before) continue;
    const entry = previous.feedback[String(before.index)];
    if (!entry) continue;
    const was = previous.findings.find(f => f.requirementIndex === before.index);
    const now = next.findings.find(f => f.requirementIndex === requirement.index);
    if (was && now && was.verdict === now.verdict && (was.basis ?? null) === (now.basis ?? null)) out[String(requirement.index)] = entry;
  }
  return out;
}
