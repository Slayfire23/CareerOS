import { foreignDirected } from "@/lib/ai/claims/language";
import { requiredMonths, unquantifiedTime, type Finding } from "@/lib/ai/match-validation";
import { answerUntrustedSpans } from "@/lib/ai/requirement-structure";
import { asksForCredential } from "@/lib/ai/rules/engine";
import { disguised, hasNegation, plainQualification } from "@/lib/ai/rules/profile-fields";
import { GENERIC_TERMS, keywordDump, labelledList, technologyTerms, words } from "@/lib/ai/skill-relations";
import { hasDirectedText, qualificationText } from "@/lib/ai/untrusted-text";
import { DETAIL_MAX } from "@/lib/ai/rules/clarification-limits";
import type { MatchRequirement } from "@/lib/ai/evidence";

// Targeted questions about what the rules couldn't settle. Everything here is deterministic, so it works
// with no AI at all, and the wording is written by code. Answering never sets a verdict: "Yes" only opens
// a form, what the person writes goes into their profile as self-reported, and the same rules read it like
// any other work description. A vague or manipulative answer is turned away before it's saved, and one that
// doesn't state the work leaves the verdict where it was.

export type ClarificationKind = "work_detail" | "credential" | "education" | "employment" | "skill_level";
export type Clarification = {
  requirementIndex: number;
  /** The requirement without any text directed at an AI or reviewer. Shown as plain text. */
  requirementText: string;
  kind: ClarificationKind;
  /** What's uncertain, when the finding's own explanation doesn't already say it. */
  why: string;
  question: string;
};

const WHY_BY_BASIS: Partial<Record<NonNullable<Finding["basis"]>, string>> = {
  described_in_work: "Your profile mentions this, but doesn't state that you did this work yourself.",
  role_description: "Your role titles or descriptions mention this, but don't show it directly.",
  project: "This appears in a project, which doesn't show it as part of a job.",
  related_technology: "You list something related, which isn't the same thing.",
  employment_dates: "Your roles may relate to this, but the rules can't tell whether they are in this field.",
  education: "Your education entry doesn't settle this.",
  listed_skill: "You list this skill, but not everything this asks for.",
  alternate_name: "You list this under another name, but not everything this asks for.",
};

function kindOf(requirement: MatchRequirement, text: string, finding: Finding): ClarificationKind {
  if (finding.basis === "listed_skill" || finding.basis === "alternate_name") return "skill_level";
  if (requirement.category === "Experience") {
    const timed = requiredMonths(text) !== null || unquantifiedTime(text);
    // Time in a field comes from role titles and dates; a sentence can't add months to a job.
    if (timed && technologyTerms(text).size === 0) return "employment";
    return "work_detail";
  }
  if (requirement.category === "Education") return "education";
  return asksForCredential(text) ? "credential" : "work_detail";
}

const QUESTIONS: Record<ClarificationKind, (asked: string) => string> = {
  work_detail: asked => `Have you done this in a job: “${asked}”? If so, which role, and what did you do?`,
  credential: asked => `Do you hold this now: “${asked}”? If so, who issued it, and when did you earn it?`,
  education: asked => `Have you completed this: “${asked}”? If so, what was the qualification, and where?`,
  employment: asked => `Are any of your jobs in this field: “${asked}”? If a role is missing or its title or dates are off, correct it in Experience.`,
  skill_level: asked => `Does your Skills entry say what this asks for: “${asked}”? If your level or the skill's name is out of date, correct it in Skills.`,
};

/** The question to ask about a finding, or null when there's nothing to ask: it's already settled, or it's
 * waiting on the job review. A requirement carrying instructions never becomes a question. */
export function clarificationFor(requirement: MatchRequirement, finding: Finding): Clarification | null {
  if (finding.review || (finding.verdict !== "possible" && finding.verdict !== "insufficient_information")) return null;
  if (hasDirectedText(requirement.text)) return null;
  const text = qualificationText(requirement.text).trim();
  if (!text) return null;
  const kind = kindOf(requirement, text, finding);
  return {
    requirementIndex: requirement.index,
    requirementText: text,
    kind,
    why: (finding.basis && WHY_BY_BASIS[finding.basis]) || "",
    question: QUESTIONS[kind](text),
  };
}

const MIN_WORDS = 5;
const MIN_SPECIFIC_WORDS = 3;
/** Praise, with little else beside it, says how someone seems and not what they did. */
const PRAISE = /\b(?:people\s+person|team\s+player|hard[-\s]work(?:er|ing)|(?:quick|fast)\s+learner|go[-\s]getter|self[-\s]starter|get\s+along|love\s+me)\b/i;
const PRAISE_ONLY_WORDS = 14;
/** Words that say nothing about what was done. */
const SAYS_NOTHING = new Set(`yes yeah yep y sure ok okay definitely absolutely of course i i've ive me my we our us you this that these those it its
is am are was were be been being have has had do did done does can could will would should a an the and or but so to in on at for from by with as
lot lots much many very really quite plenty some any all always often sometimes years year yrs yr months month time times long
experience experienced knowledge familiar skilled expert good great strong solid work worked working job jobs role roles thing things stuff
know knew qualified meet meets met requirement requirements claim true correct confirm confirmed confirming`.split(/\s+/));

/** Why an answer can't be saved, or null when it's specific enough for the rules to read. Only the rules
 * decide what it shows. */
export function answerProblem(detail: string, requirementText: string): string | null {
  const text = detail.trim();
  if (text.length > DETAIL_MAX) return `Keep this to ${DETAIL_MAX} characters.`;
  if (disguised(text)) return "This contains hidden or look-alike characters. Type it plainly.";
  const all = words(text);
  const asked = new Set(words(requirementText));
  const specific = all.filter(w => !SAYS_NOTHING.has(w) && !GENERIC_TERMS.has(w) && !asked.has(w));
  if (all.length < MIN_WORDS || specific.length < MIN_SPECIFIC_WORDS) return "Say what you actually did: the task, what you worked on, and for whom or how often. A yes alone can't be used.";
  if (keywordDump(text) || labelledList(text)) return "Write this as a sentence about what you did, not a list of terms.";
  if (PRAISE.test(text) && all.length < PRAISE_ONLY_WORDS) return "Say what you actually did: the task, what you worked on, and for whom or how often. A yes alone can't be used.";
  if (hasNegation(text)) return "This reads as not having done it, or wanting to. If you haven't, choose \u201cNo, I don't have this\u201d. Add details only for work you've done.";
  if (answerUntrustedSpans(text).length || foreignDirected(text)) return "Describe only your own work. Remarks about how this should be judged can't be used.";
  return null;
}

/** Why a typed credential or qualification can't be saved, or null. */
export function entryProblem(qualification: string, asOf: string, endMonth: string | null): string | null {
  if (!plainQualification(qualification)) return "Enter only the name of what you earned, and only if it's complete.";
  if (endMonth !== null && endMonth > asOf) return "Enter a month that has already passed. Only add what you've finished.";
  return null;
}
