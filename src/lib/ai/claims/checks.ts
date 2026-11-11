import type { Evidence } from "@/lib/ai/evidence";
import { employmentMonths, roleMonths, type ExperienceEvidence } from "@/lib/ai/evidence";
import { foreignNegation, otherPersonInAnyLanguage, plainLanguage } from "@/lib/ai/claims/language";
import { untrustedEvidenceSpans } from "@/lib/ai/requirement-structure";
import { gradeDiffers } from "@/lib/ai/rules/engine";
import { disguised, educationStatus, notAStatement, notHeld, plainCredentialName, plainQualification, plainTitle, rolePart } from "@/lib/ai/rules/profile-fields";
import { canonicalTerms, fragmentOfLongerName, keywordDump, labelledList, negatedSpans, ordinaryMeaning, otherSense, plainSkillName, quoteTerms, saysAbsent, sentenceAt, thirdPartyCue } from "@/lib/ai/skill-relations";
import { directedSpans } from "@/lib/ai/untrusted-text";
import type { ClaimCheck, Holder, Modality, Polarity, RejectionReason, SourceField } from "@/lib/ai/claims/types";

// One independent function per hard check. They wrap the engine's tested helpers and record the answer.
// None of them takes a similarity score or a confidence, so AI can't influence any of them.

const STRUCTURED: ReadonlySet<SourceField> = new Set(["name", "job_title", "qualification", "field_of_study", "title", "skills"]);
const overlaps = (spans: [number, number][], start: number, end: number) => spans.some(([s, e]) => s < end && start < e);

/** Whether this text may take part in matching at all. */
export function screenText(value: string, field: SourceField, start: number, end: number): RejectionReason | null {
  if (disguised(value)) return "hidden_characters";
  if (STRUCTURED.has(field)) {
    const plain = field === "name" || field === "skills" ? plainSkillName(value) || plainCredentialName(value)
      : field === "qualification" ? plainQualification(value)
      : plainTitle(value);
    return plain ? null : "claim_in_field";
  }
  const sentence = sentenceAt(value, start, end);
  if (keywordDump(sentence)) return "keyword_dump";
  if (notAStatement(value.slice(Math.max(0, value.slice(0, start).search(/[^.!?\n]*$/)), end + Math.max(0, value.slice(end).search(/[.!?\n]|$/))))) return "not_a_statement";
  if (overlaps(directedSpans(value), start, end)) return "directed_text";
  const negated = negatedSpans(value);
  if (overlaps(untrustedEvidenceSpans(value).filter(([s, e]) => !negated.some(([a, b]) => a === s && b === e)), start, end)) return "directed_text";
  return null;
}

const WISH = /\b(would\s+(?:love|like)|d\s+love|love\s+to|excited|eager|keen|dreams?|aspir\w+|wish\w*|looking\s+forward|hop(?:e|es|ing))\b/i;
const PLAN = /\b(plans?|planning|intends?|aims?|aiming|going\s+to|want(?:s|ed)?\s+to|not\s+yet|yet\s+to)\b/i;

/** Positive, negative, or uncertain: who says this was done, and whether it's said at all. */
export function checkAssertion(value: string, field: SourceField, start: number, end: number): { polarity: Polarity; modality: Modality; cueSpan: [number, number] | null; reason: RejectionReason | null } {
  if (STRUCTURED.has(field)) {
    if (saysAbsent(value)) return { polarity: "negative", modality: "stated", cueSpan: null, reason: "negated" };
    if (notHeld(value)) return { polarity: "negative", modality: /\b(expired|lapsed)\b/i.test(value) ? "expired" : "pending", cueSpan: null, reason: "credential_not_held" };
    return { polarity: "positive", modality: "stated", cueSpan: null, reason: null };
  }
  const span = negatedSpans(value).find(([s, e]) => s < end && start < e);
  if (!span) {
    // Another language's negative: "Je ne connais pas Python". A warning word is enough to stop calling it positive.
    const sentence = sentenceAt(value, start, end);
    if (plainLanguage(sentence) !== "en" && foreignNegation(sentence)) return { polarity: "negative", modality: "stated", cueSpan: null, reason: "negated" };
    return { polarity: "positive", modality: "stated", cueSpan: null, reason: null };
  }
  const clause = value.slice(span[0], span[1]);
  if (WISH.test(clause)) return { polarity: "uncertain", modality: "wish", cueSpan: span, reason: "wish_or_plan" };
  if (PLAN.test(clause)) return { polarity: "uncertain", modality: "planned", cueSpan: span, reason: "wish_or_plan" };
  return { polarity: "negative", modality: "stated", cueSpan: span, reason: "negated" };
}

/** Whose work this is. Unknown only when the text gives no way to tell. */
export function checkOwnership(value: string, field: SourceField, start: number, end: number): { holder: Holder; cueSpan: [number, number] | null } {
  if (STRUCTURED.has(field)) return { holder: "candidate", cueSpan: null };
  const from = value.slice(0, start).search(/[^.!?;\n]*$/);
  const sentence = sentenceAt(value, start, end);
  if (!/^[\x00-\x7F]*$/.test(sentence) && otherPersonInAnyLanguage(sentence)) return { holder: "third_party", cueSpan: [from, from + sentence.length] };
  const cue = thirdPartyCue(sentenceAt(value, start, end), value.slice(end).split(/[.!?;\n]\s/)[0]);
  if (cue) return { holder: "third_party", cueSpan: [from + cue[0], from + cue[1]] };
  return { holder: "candidate", cueSpan: null };
}

/** Whether a word found here means what the requirement means. */
export function checkSense(asked: string, value: string, quote: string, field: SourceField, title: string | null): RejectionReason | null {
  for (const term of canonicalTerms(quote)) {
    if (otherSense(asked, term) !== otherSense(value, term)) return "other_sense";
    if (!STRUCTURED.has(field) && ordinaryMeaning(value, term)) return "other_sense";
  }
  if (!STRUCTURED.has(field) && !quoteTerms(quote, value).size) return "other_sense";
  if (!STRUCTURED.has(field) && fragmentOfLongerName(asked, value, quote)) return "other_sense";
  if (field === "job_title" && title && !rolePart(title).toLowerCase().includes(quote.toLowerCase())) return "workplace_name";
  return null;
}

/** A credential is held, at the grade asked, or the entry says otherwise. */
export function checkCredential(asked: string, item: Evidence, asOf: string, value: string, structured: boolean): RejectionReason | null {
  if (!structured) return null;
  if (gradeDiffers(asked, value)) return "credential_grade_differs";
  if (notHeld(value)) return "credential_not_held";
  if (item.kind === "education" && educationStatus(item, asOf) !== "completed") return "credential_not_held";
  if (item.kind === "skill" && !plainCredentialName(value)) return "credential_not_held";
  return null;
}

/** Time in the field, overlaps once. Computed from stored dates, never read from free text. */
export function checkDuration(required: number | null, roles: ExperienceEvidence[], asOf: string): { merged: number; reason: RejectionReason | null } {
  const merged = employmentMonths(roles, asOf);
  if (roles.length && roles.every(r => roleMonths(r, asOf) === 0)) return { merged, reason: "impossible_dates" };
  return { merged, reason: required !== null && merged < required ? "insufficient_time" : null };
}

export const looksLikeList = (value: string, start: number, end: number) => labelledList(sentenceAt(value, start, end));
export const check = (name: ClaimCheck["check"], reason: ClaimCheck["reason"]): ClaimCheck => ({ check: name, passed: reason === null, reason });
