import { answerLanguage } from "@/lib/ai/answer-language";
import { citesLapsedAnswer, isChoiceEvidenceId } from "@/lib/ai/choice-evidence";
import { monthIndex, roleMonths, type ExperienceEvidence, type MatchRequest, type MatchRequirement } from "@/lib/ai/evidence";
import { DEFAULT_TEXT_RULES } from "@/lib/ai/evidence-boundary";
import type { Finding, RuleBasis } from "@/lib/ai/match-validation";
import { approvedSplitFor } from "@/lib/ai/rules/approved-split-link";
import { readAnswer, titleContradicted, type LinkedAnswer } from "@/lib/ai/rules/answer-review";
import type { RawFinding } from "@/lib/ai/rules/engine";
import { recognizeParts } from "@/lib/ai/rules/split-recognition";
import type { Involvement } from "@/lib/ai/rules/structured-answer";
import { assessConsistency } from "@/lib/ai/rules/structured-consistency";
import { FORM_RECOGNITION_VERSION } from "@/lib/ai/rules/structured-form";
import { matchStructuredAnswer, type PartReadings, type StructuredAnswerRecord, type StructuredMatch, type TextReadings } from "@/lib/ai/rules/structured-matching";

// Phase 5.3 Stage F4: structured answers (formVersion 2) in matching, behind STRUCTURED_MATCHING_ENABLED. Pure: the caller
// loads the rows and decides the flag; this composes the F2 module with the rules' findings, after free-text answers.
//
//   - Readings use the default reader and the form's recognition version, never rules-v22 (F0) unless adopted.
//   - Free-text answers win (§6.2): a structured answer to a question a free-text answer, entry or denial covers is ignored.
//   - "Haven't done this" is today's denial: it goes in as an ordinary deny record (`structuredDenials`).
//   - F-5: the Stage 1c title-only rule applies to a structured description exactly as to free text (`titleContradicted`).
//     It is the one way an answer can lower anything, and only a verdict that rests on a job title alone.
//   - Choice-only results (`candidate_choice`) are NOT stored in F4: the match page can't show a `choice:` citation yet
//     (F3 report §6). Such a finding is left as the rules gave it, and counted in `withheld`.
//   - Splits: exact wording only (E1); lead choices on a split stay Not enough information; whole transfer contradicts
//     the tick; quotes use the approved fallback (F-4b not done; splits-v1.1 unchanged). All of it inside F2's module.

const EXPLAIN = {
  supported: "Your structured answer describes doing this work yourself.",
  possible: "Your structured answer describes related work, or part of what this asks for.",
};
const MASKED = "This relied on a structured answer, which isn't used for matching right now. Run the analysis again.";
const WITHHELD = "This result rests on a structured choice alone, which isn't shown yet. Run the analysis again.";

/** A structured answer row as loaded for matching (an active formVersion 2 answer, with its parts). */
export type StructuredRow = StructuredAnswerRecord;

/** The keys a free-text answer, entry or denial covers: on those questions it wins. */
export type FreeTextKeys = ReadonlySet<string>;

const keysOf = (r: Pick<StructuredRow, "questionKey" | "coveredKeys">) => [...new Set([r.questionKey, ...r.coveredKeys].filter((k): k is string => !!k))];
const isDenial = (r: StructuredRow) => r.involvement === "NOT_DONE";

/** Valid, active structured "haven't done this" answers, as the ordinary deny records the rules already apply. */
export function structuredDenials(rows: StructuredRow[], freeText: FreeTextKeys): LinkedAnswer[] {
  return rows
    .filter(r => isDenial(r) && r.status === "ACTIVE" && r.formVersion === 2 && r.outcome === "DENIED" && r.experienceId === null && !r.detail && r.parts.length === 0 && !!r.questionKey)
    .flatMap(r => keysOf(r).filter(k => !freeText.has(k)).map((questionKey): LinkedAnswer => ({ action: "deny", questionKey })));
}

/** What makes the analysis out of date (F-10): each structured answer counts by its own id (every save or correction is a
 * new row), and only while structured matching is on. */
export const structuredFingerprintAnswers = (rows: StructuredRow[], freeText: FreeTextKeys) => [
  ...structuredDenials(rows, freeText),
  ...rows.filter(r => !isDenial(r) && r.status === "ACTIVE" && r.questionKey).map(r => ({ action: `structured:${r.id}`, questionKey: r.questionKey! })),
];

/** The role's months and how long ago it ended, at the analysis month, from the request's own evidence. */
function roleOf(request: MatchRequest, experienceId: string | null) {
  const role = request.evidence.find((e): e is ExperienceEvidence => e.kind === "experience" && e.id === `experience:${experienceId}` && e.source !== "clarification");
  if (!role) return null;
  const ended = role.end_month === null ? null : monthIndex(request.as_of_month) - monthIndex(role.end_month);
  return { months: roleMonths(role, request.as_of_month), endedMonthsAgo: ended === null ? null : Math.max(0, ended) };
}

/** Readings of the description with the default reader, and recognition for an approved split it answers alone. */
function readingsFor(requirement: MatchRequirement, row: StructuredRow): { text: TextReadings | null; parts: PartReadings | null } {
  const detail = row.detail?.trim() ?? "";
  if (!detail) return { text: null, parts: null };
  const reading = readAnswer(requirement, detail);
  const text: TextReadings = {
    readerVersion: DEFAULT_TEXT_RULES, forText: detail, requirementReading: { verdict: reading.verdict, quote: reading.quote },
    consistency: assessConsistency({ requirement, involvement: row.involvement as Involvement, explanation: detail }).consistency,
  };
  const split = approvedSplitFor(requirement.text);
  if (!split || row.coveredKeys.length > 1) return { text, parts: null };
  const r = recognizeParts({ splitId: split.splitId, explanation: detail });
  return { text, parts: { recognitionVersion: r.version, readerVersion: DEFAULT_TEXT_RULES, forText: detail, splitId: r.splitId, read: r.read, parts: r.parts, transferAll: r.transferAll } };
}

export type StructuredApplication = {
  findings: RawFinding[];
  /** The recognition version, when any structured answer was read with split recognition; else null. */
  recognitionVersion: string | null;
  /** Choice-only results left out (F4: not stored until the page can show them). */
  withheld: number;
  results: { requirementIndex: number; match: StructuredMatch | null; titleLowered: boolean }[];
};

/** Applies active structured answers (not denials) to the findings, after free-text answers and before follow-ups. */
export function applyStructuredAnswers(request: MatchRequest, findings: RawFinding[], rows: StructuredRow[], freeText: FreeTextKeys, keyFor: (r: MatchRequirement) => string): StructuredApplication {
  let recognitionVersion: string | null = null;
  let withheld = 0;
  const results: StructuredApplication["results"] = [];
  const out = findings.map(f => {
    if (f.review) return f;
    const requirement = request.requirements.find(r => r.index === f.requirement_index)!;
    const key = keyFor(requirement);
    const candidates = rows.filter(r => !isDenial(r) && keysOf(r).includes(key));
    // One answer per question (E2, `retireStructured`); anything else fails closed.
    if (candidates.length !== 1) return f;
    const row = candidates[0];
    const match = matchStructuredAnswer({
      requirement, questionKey: key, finding: { verdict: f.verdict, basis: f.basis }, answer: row, role: roleOf(request, row.experienceId),
      freeTextCounts: freeText.has(key), ...readingsFor(requirement, row),
    });
    if (match.ignored) { results.push({ requirementIndex: f.requirement_index, match, titleLowered: false }); return f; }
    if (match.split) recognitionVersion = FORM_RECOGNITION_VERSION;
    // F-5: the title-only rule, applied to the structured description exactly as to a free-text answer.
    const detail = row.detail?.trim() ?? "";
    if (detail && answerLanguage(detail) === "en") {
      const lowered = titleContradicted(request, requirement, { action: "confirm", questionKey: key, evidenceId: `experience:${row.id}`, detail }, f, {});
      if (lowered) { results.push({ requirementIndex: f.requirement_index, match, titleLowered: true }); return lowered; }
    }
    results.push({ requirementIndex: f.requirement_index, match, titleLowered: false });
    if (!match.changed || !match.citation) return f;
    if (match.basis === "candidate_choice") { withheld++; return f; }
    if (match.basis !== "candidate_answer" || !match.citation.quote || (match.verdict !== "supported" && match.verdict !== "possible")) return f;
    return {
      ...f,
      verdict: match.verdict,
      explanation: EXPLAIN[match.verdict],
      citations: [{ evidence_id: match.citation.evidenceId, quote: match.citation.quote }],
      caveats: (match.reading?.caveats ?? []).slice(0, 5),
      basis: "candidate_answer" as RuleBasis,
      rules_only_verdict: f.rules_only_verdict ?? f.verdict,
    };
  });
  return { findings: out, recognitionVersion, withheld, results };
}

/** What a stored analysis may no longer show while structured matching is off (F-9): anything citing a structured answer,
 * and a denial that only a structured "haven't done this" gave. Empty while it's on. */
export type StructuredMask = { evidence: ReadonlySet<string>; denialKeys: ReadonlySet<string> };
export const NO_MASK: StructuredMask = { evidence: new Set(), denialKeys: new Set() };

export function maskStructuredFindings<T extends Pick<Finding, "requirementIndex" | "verdict" | "explanation" | "citations" | "caveats" | "basis" | "evidenceSources">>(findings: T[], requirements: MatchRequirement[], mask: StructuredMask, keyFor: (r: MatchRequirement) => string): T[] {
  if (!mask.evidence.size && !mask.denialKeys.size) return findings;
  return findings.map(f => {
    const requirement = requirements.find(r => r.index === f.requirementIndex);
    const denial = f.basis === "candidate_denied" && !!requirement && mask.denialKeys.has(keyFor(requirement));
    if (!denial && !f.citations.some(c => citesLapsedAnswer(c.evidenceId, mask.evidence))) return f;
    return { ...f, verdict: "insufficient_information", explanation: MASKED, citations: [], caveats: [], evidenceSources: [] };
  });
}

/** Stage F4 citation safety: a finding resting on a structured choice (`choice:<id>`) is never shown or counted until the
 * match page can show one (F5). F4 never stores one; this covers any stored by other means, whatever the flags. */
export function withholdChoiceFindings<T extends Pick<Finding, "verdict" | "explanation" | "citations" | "caveats" | "evidenceSources">>(findings: T[]): T[] {
  if (!findings.some(f => f.citations.some(c => isChoiceEvidenceId(c.evidenceId)))) return findings;
  return findings.map(f => (f.citations.some(c => isChoiceEvidenceId(c.evidenceId)) ? { ...f, verdict: "insufficient_information", explanation: WITHHELD, citations: [], caveats: [], evidenceSources: [] } : f));
}
