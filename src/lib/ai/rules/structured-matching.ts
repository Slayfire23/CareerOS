import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { answerStatements, DEFAULT_TEXT_RULES, type TextRules } from "@/lib/ai/evidence-boundary";
import { requiredMonths } from "@/lib/ai/match-validation";
import { approvedSplitFor } from "@/lib/ai/rules/approved-split-link";
import { readStructuredAnswer, type Consistency, type Involvement, type StructuredReading, type WorkFrequency, type WorkRecency } from "@/lib/ai/rules/structured-answer";
import { FORM_RECOGNITION_VERSION } from "@/lib/ai/rules/structured-form";
import { qualificationText } from "@/lib/ai/untrusted-text";

// Phase 5.3 Stage F2: how one structured answer (formVersion 2) would apply to one requirement's rules finding.
// Design: docs/PHASE5_3_STAGE_F_DESIGN.md §3–6 (decisions F-2, F-3, F-6, F-7; F-4 as data only).
//
// PURE and NOT CONNECTED. No database, network, flags, model or state: everything it reads is in its input, and it changes
// nothing. Nothing in the application imports it (guarded by tests); Stage F4 wires it behind its own flag.
//
// The verdict comes from the approved rule table, `readStructuredAnswer` (Stage 4A, D1–D3, O1–O3). This module only:
//   1. refuses anything it can't trust (fail closed: the finding is returned unchanged, with the reason);
//   2. builds the rule table's input from readings the caller supplies, each tagged with its reader and recognition
//      version, which must be the expected ones (the default reader unless the caller explicitly asks for another);
//   3. decides "the text shows the work" itself, from the reading of the actual requirement (or, for an approved split,
//      from recognition of each ticked part), never from a supplied consistency flag (F0's consistency gap);
//   4. applies the reading with the same contract as free-text answers: Supported is never lowered, Possible raises only
//      Not enough information, Not enough information changes nothing, a "haven't done this" acts as a denial.

export const STRUCTURED_MATCHING_VERSION = "structured-matching-v2" as const;

const INVOLVEMENTS: readonly Involvement[] = ["PERFORMED", "PART", "SUPERVISED", "REQUESTED", "ASSISTED", "OBSERVED_TRAINED", "TAUGHT", "NOT_DONE"];
const FREQUENCIES: readonly WorkFrequency[] = ["MOST_DAYS", "WEEKLY", "MONTHLY", "FEW_TIMES", "ONCE"];
const RECENCIES: readonly WorkRecency[] = ["CURRENT", "WITHIN_YEAR", "ONE_TO_THREE_YEARS", "OVER_THREE_YEARS"];
const RANK: Record<Verdict, number> = { gap: 0, insufficient_information: 1, possible: 2, supported: 3 };

/** A stored structured answer, as the database holds it. Typed loosely on purpose: it's checked here, not trusted. */
export type StructuredAnswerRecord = {
  id: string;
  status: string;
  formVersion: number;
  outcome: string;
  involvement: string | null;
  alsoDidSome: boolean | null;
  frequency: string | null;
  recency: string | null;
  claimedMonths: number | null;
  experienceId: string | null;
  detail: string | null;
  /** The id citations use (`experience:<id>` for a role answer since Stage F1; none for a denial). */
  evidenceId: string | null;
  questionKey: string | null;
  coveredKeys: string[];
  parts: { partIndex: number; partText: string; checked: boolean }[];
};

/** How the description reads, computed by the caller with ONE reader version over exactly `forText`. */
export type TextReadings = {
  readerVersion: TextRules;
  forText: string;
  /** The consistency reading for this answer's choice (Stage 3). Its `textShowsWork` is ignored here (see `showsTheWork`). */
  consistency: Consistency;
  /** `readAnswer` of the description against this requirement: whether the person's own words show the asked work. */
  requirementReading: { verdict: Verdict; quote: string | null };
};

/** Recognition of an approved split's parts, computed by the caller over exactly `forText`. */
export type PartReadings = {
  recognitionVersion: string;
  readerVersion: TextRules;
  forText: string;
  splitId: string;
  read: boolean;
  parts: { part: string; shown: boolean; transferred: boolean }[];
  transferAll: boolean;
};

export type StructuredMatchInput = {
  requirement: MatchRequirement;
  /** The question key the review uses for this requirement. */
  questionKey: string;
  /** The rules' finding before any answer. */
  finding: { verdict: Verdict; basis: string | null };
  answer: StructuredAnswerRecord;
  /** The role the answer is attached to, from its dates at the analysis month. Required for every choice but NOT_DONE. */
  role: { months: number; endedMonthsAgo: number | null } | null;
  /** A free-text answer, entry or denial already counts for this question: it wins (design §6.2). */
  freeTextCounts: boolean;
  text: TextReadings | null;
  parts: PartReadings | null;
  /** The versions the readings must have. Defaults: the default reader and the form's recognition version. */
  expect?: { readerVersion?: TextRules; recognitionVersion?: string };
};

export type IgnoredReason =
  | "free_text_counts"
  | "not_active"
  | "not_structured"
  | "not_this_question"
  | "invalid_answer"
  | "missing_role"
  | "evidence_id_mismatch"
  | "missing_reading"
  | "reading_for_other_text"
  | "reader_version_mismatch"
  | "recognition_version_mismatch"
  | "recognition_for_other_split"
  | "parts_without_split";

export type StructuredBasis = "candidate_answer" | "candidate_choice" | "candidate_denied";

export type StructuredMatch = {
  version: typeof STRUCTURED_MATCHING_VERSION;
  /** Why the answer was not used; null when it was read. */
  ignored: IgnoredReason | null;
  /** Whether the finding's verdict changed. */
  changed: boolean;
  verdict: Verdict;
  rulesOnlyVerdict: Verdict;
  /** candidate_answer: the person's own words, quoted verbatim. candidate_choice: the choice itself (a claim, at most
   * Possible). candidate_denied: "haven't done this". Data only: the validator doesn't know candidate_choice yet (F3). */
  basis: StructuredBasis | null;
  citation: { evidenceId: string; quote: string | null } | null;
  reading: StructuredReading | null;
  split: { splitId: string; grouped: boolean; partsMatch: boolean; parts: { part: string; checked: boolean; shown: boolean }[] } | null;
  versions: { reader: TextRules; recognition: string | null };
};

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** The stored combination, checked again (it restates the database CHECK and Stage E's `parseSubmission`). */
function validAnswer(a: StructuredAnswerRecord): a is StructuredAnswerRecord & { involvement: Involvement } {
  if (!isOneOf(INVOLVEMENTS, a.involvement)) return false;
  if (a.frequency !== null && !isOneOf(FREQUENCIES, a.frequency)) return false;
  if (a.recency !== null && !isOneOf(RECENCIES, a.recency)) return false;
  if (a.claimedMonths !== null && (!Number.isInteger(a.claimedMonths) || a.claimedMonths < 1 || a.claimedMonths > 720 || !["PERFORMED", "PART"].includes(a.involvement))) return false;
  if (!Array.isArray(a.coveredKeys) || !Array.isArray(a.parts)) return false;
  switch (a.involvement) {
    case "NOT_DONE":
      return a.outcome === "DENIED" && a.alsoDidSome === null && a.frequency === null && a.recency === null && a.experienceId === null && !a.detail && a.parts.length === 0;
    case "PERFORMED":
      return a.outcome === "ROLE_DETAIL_ADDED" && a.frequency !== null && a.recency !== null && a.alsoDidSome === null && !!a.experienceId;
    case "PART":
      return a.outcome === "ROLE_DETAIL_ADDED" && a.frequency !== null && a.recency !== null && a.alsoDidSome !== false && !!a.experienceId;
    case "OBSERVED_TRAINED":
      return a.outcome === "ROLE_DETAIL_ADDED" && a.frequency === null && a.recency === null && a.alsoDidSome === null && !!a.experienceId;
    default: // SUPERVISED, REQUESTED, ASSISTED, TAUGHT
      return a.outcome === "ROLE_DETAIL_ADDED" && a.frequency === null && a.recency === null && a.alsoDidSome !== true && !!a.experienceId;
  }
}

const validRole = (r: StructuredMatchInput["role"]) =>
  !!r && Number.isInteger(r.months) && r.months >= 0 && (r.endedMonthsAgo === null || (Number.isInteger(r.endedMonthsAgo) && r.endedMonthsAgo >= 0));

/** The person's own words, verbatim: `quote` must be a non-empty substring of the description. */
const verbatim = (description: string, quote: string | null | undefined): string | null => {
  const q = quote?.trim();
  return q && description.includes(q) ? q.slice(0, 300) : null;
};

export function matchStructuredAnswer(input: StructuredMatchInput): StructuredMatch {
  const readerVersion = input.expect?.readerVersion ?? DEFAULT_TEXT_RULES;
  const recognitionVersion = input.expect?.recognitionVersion ?? FORM_RECOGNITION_VERSION;
  const before = input.finding.verdict;
  const base = { version: STRUCTURED_MATCHING_VERSION, rulesOnlyVerdict: before, versions: { reader: readerVersion, recognition: null as string | null } };
  const ignore = (ignored: IgnoredReason): StructuredMatch => ({ ...base, ignored, changed: false, verdict: before, basis: null, citation: null, reading: null, split: null });

  const a = input.answer;
  // Precedence and status (design §4 "Answer status", §6.2).
  if (input.freeTextCounts) return ignore("free_text_counts");
  if (a.status !== "ACTIVE") return ignore("not_active");
  if (a.formVersion !== 2) return ignore("not_structured");
  if (a.questionKey !== input.questionKey && !a.coveredKeys?.includes(input.questionKey)) return ignore("not_this_question");
  if (!validAnswer(a)) return ignore("invalid_answer");
  const involvement = a.involvement;

  // A "haven't done this" acts as a denial (4A §4): a rules Supported stands, a gap stays, anything else is Not supported.
  if (involvement === "NOT_DONE") {
    const reading = readStructuredAnswer({ requirement: input.requirement, involvement, alsoDidSome: null, frequency: null, recency: null, claimedMonths: null, consistency: { state: "no_text" } });
    const denies = before !== "supported" && before !== "gap";
    return { ...base, ignored: null, changed: denies, verdict: denies ? "gap" : before, basis: denies ? "candidate_denied" : null, citation: null, reading, split: null };
  }

  if (!validRole(input.role)) return ignore("missing_role");
  // Every role answer carries its own evidence id (F1), so revoking or deleting it can mask what cites it.
  if (a.evidenceId !== `experience:${a.id}`) return ignore("evidence_id_mismatch");

  // The description, and readings of exactly that description with the expected versions.
  const description = a.detail?.trim() ?? "";
  if (description) {
    if (!input.text) return ignore("missing_reading");
    if (input.text.forText.trim() !== description) return ignore("reading_for_other_text");
    if (input.text.readerVersion !== readerVersion) return ignore("reader_version_mismatch");
  }

  // Approved splits: exact wording only (E1), never for a grouped question's parts (F-7), never for an unsplit requirement.
  const linked = approvedSplitFor(input.requirement.text);
  const grouped = a.coveredKeys.length > 1;
  if (!linked && a.parts.length > 0) return ignore("parts_without_split");
  let split: StructuredMatch["split"] = null;
  let compound: { approved: true; parts: { part: string; checked: boolean; textShowsWork: boolean; contradicted: boolean }[] } | null = null;
  let everyTickedShown = false;
  let transferAll = false;
  if (linked) {
    // The stored parts must be the approved parts, in order and in their exact wording; anything else counts as no part
    // ticked (design §5: fail closed). A grouped question showed no parts at all (F-7), and the form asks parts only for
    // "did it myself" or "did some of it": any other choice on a split has none, so the compound rule gives Not enough.
    const partsMatch = !grouped && a.parts.length === linked.parts.length && a.parts.every(p => p.partIndex >= 0 && p.partIndex < linked.parts.length && linked.parts[p.partIndex] === p.partText) && new Set(a.parts.map(p => p.partIndex)).size === a.parts.length;
    const ticked = linked.parts.map((_, i) => partsMatch && !!a.parts.find(p => p.partIndex === i)?.checked);
    let shown = linked.parts.map(() => false);
    if (description && !grouped) {
      const r = input.parts;
      if (!r) return ignore("missing_reading");
      if (r.forText.trim() !== description) return ignore("reading_for_other_text");
      if (r.readerVersion !== readerVersion) return ignore("reader_version_mismatch");
      if (r.recognitionVersion !== recognitionVersion) return ignore("recognition_version_mismatch");
      if (r.splitId !== linked.splitId || r.parts.length !== linked.parts.length || r.parts.some((p, i) => p.part !== linked.parts[i])) return ignore("recognition_for_other_split");
      shown = r.parts.map(p => r.read && p.shown);
      transferAll = r.transferAll;
    }
    // F-3: the whole text shows the work only when every ticked part is shown by the person's own clause (DD1 / X2 held).
    everyTickedShown = ticked.some(Boolean) && ticked.every((t, i) => !t || shown[i]);
    // F-2: a transferred part isn't a contradiction until rules-v22 is adopted; it is simply not shown.
    compound = { approved: true, parts: linked.parts.map((part, i) => ({ part, checked: ticked[i], textShowsWork: shown[i], contradicted: false })) };
    split = { splitId: linked.splitId, grouped, partsMatch, parts: linked.parts.map((part, i) => ({ part, checked: ticked[i], shown: shown[i] })) };
    base.versions.recognition = recognitionVersion;
  }

  // "The text shows the work" (F0's consistency gap): a consistent explanation is not enough. For a whole requirement the
  // person's own words must show this requirement's work (`readAnswer` Supported, with a verbatim quote); for an approved
  // split, every ticked part must be shown by recognition. Whatever `textShowsWork` the caller supplied is ignored.
  const supplied: Consistency = description ? input.text!.consistency : { state: "no_text" };
  const requirementQuote = description ? verbatim(description, input.text!.requirementReading.quote) : null;
  const showsTheWork = linked ? everyTickedShown : input.text?.requirementReading.verdict === "supported" && !!requirementQuote;
  let consistency: Consistency = supplied.state === "consistent" ? { state: "consistent", textShowsWork: !!description && showsTheWork } : supplied;
  // The reviewed simulation (and the 284-row parity fixture): when the work went to someone else and no own clause is left,
  // the explanation contradicts the tick.
  if (transferAll) consistency = { state: "text_mismatch", textSuggests: null };

  const reading = readStructuredAnswer({
    requirement: input.requirement,
    involvement,
    alsoDidSome: a.alsoDidSome,
    frequency: a.frequency as WorkFrequency | null,
    recency: a.recency as WorkRecency | null,
    claimedMonths: a.claimedMonths,
    consistency,
    role: input.role,
    compound,
  });

  const answerId = `experience:${a.id}`;
  const choice = { evidenceId: `choice:${a.id}`, quote: null };
  // The person's own words for a citation, only where they relate to what's asked (Stage F4: never cite unrelated words as
  // support, the consistency gap in another form). A whole requirement: the requirement reading's own quote. An approved
  // split, until F-4b: the description's first own statement, and only when recognition shows a ticked part in the
  // person's own words. Only a consistent explanation is quoted. Anything else is the choice itself (candidate_choice).
  const ownQuote = (): string | null => {
    if (!description || consistency.state !== "consistent") return null;
    if (requirementQuote) return requirementQuote;
    if (!split?.parts.some(p => p.checked && p.shown)) return null;
    const first = answerStatements(description, readerVersion).find(s => s.subject === "self");
    return verbatim(description, first?.text);
  };
  const result = (verdict: Verdict, basis: StructuredBasis, citation: StructuredMatch["citation"]): StructuredMatch => ({ ...base, ignored: null, changed: verdict !== before, verdict, basis, citation, reading, split });
  const unchanged = (): StructuredMatch => ({ ...base, ignored: null, changed: false, verdict: before, basis: null, citation: null, reading, split });

  // A rules Supported is never lowered here (the Stage 1c title-only exception, F-5, belongs to F4's composition).
  if (before === "supported") return unchanged();
  // A gap stays, except `employment_dates`: a claimed amount of time at least what's asked gives Possible, never more, as
  // the existing free-text claim rule does (F-6). It's a claim, not dates, and the choice's own limits (recency, role
  // dates, contradictions) must allow at least Possible.
  if (before === "gap") {
    const needed = requiredMonths(qualificationText(input.requirement.text));
    const claims = input.finding.basis === "employment_dates" && (involvement === "PERFORMED" || involvement === "PART") && needed !== null && a.claimedMonths !== null && a.claimedMonths >= needed;
    return claims && RANK[reading.verdict] >= RANK.possible ? result("possible", "candidate_choice", choice) : unchanged();
  }
  if (reading.verdict === "supported") {
    const quote = ownQuote();
    // Supported needs the person's own words to quote. Without them it's a claim: Possible at most.
    if (quote) return result("supported", "candidate_answer", { evidenceId: answerId, quote });
    return before === "insufficient_information" ? result("possible", "candidate_choice", choice) : unchanged();
  }
  if (reading.verdict === "possible" && before === "insufficient_information") {
    const quote = ownQuote();
    return quote ? result("possible", "candidate_answer", { evidenceId: answerId, quote }) : result("possible", "candidate_choice", choice);
  }
  return unchanged();
}
