import type { MatchRequirement, Verdict } from "@/lib/ai/evidence";
import { explicitRecency, type RecencyRequirement } from "@/lib/ai/requirement-structure";

// Structured ownership (Phase 5.3 Stage 2): the deterministic rule table from the approved design (§4–5), with the owner's
// D1–D3 conditions and decisions O1–O3. Pure: no input/output, no model, and it never reads free text. What the person's
// explanation shows arrives as a supplied consistency state; computing that state from the text is Stage 3.
// Not connected to matching, the review queue or any workflow yet: nothing calls this outside its tests.
//
// D1  "I did it myself" with a consistent role, frequency and recency reaches Possible without matching text. Supported
//     needs consistent English text showing the work in the requirement's words or an approved equivalence (supplied as
//     `textShowsWork`), never a choice alone. A contradiction gives no automatic credit and asks for clarification.
// D2  "More than 3 years ago" is a note, unless the requirement explicitly asks for recent experience; then the answer's
//     recency is checked against that window.
// D3  Text that isn't English is kept as written and never read: the choice can reach Possible at most, and nothing
//     claims the text was understood.
// O1  TAUGHT ("I taught or trained others to do it"): Possible at most, unless the requirement is about training others.
// O2  REQUESTED ("I arranged it, requested it, or handled the paperwork for it"): no credit for the work itself, unless the
//     requirement is about coordinating, scheduling, purchasing, vendors or records.
// O3  A compound requirement, once its split is approved, takes the lowest verdict over its necessary parts; some parts
//     done reaches Possible at most and names what's missing.

export type Involvement = "PERFORMED" | "PART" | "SUPERVISED" | "REQUESTED" | "ASSISTED" | "OBSERVED_TRAINED" | "TAUGHT" | "NOT_DONE";
export type WorkFrequency = "MOST_DAYS" | "WEEKLY" | "MONTHLY" | "FEW_TIMES" | "ONCE";
export type WorkRecency = "CURRENT" | "WITHIN_YEAR" | "ONE_TO_THREE_YEARS" | "OVER_THREE_YEARS";
/** What the explanation shows relative to the choice. Supplied by the caller (Stage 3 computes it); never derived here. */
export type Consistency =
  | { state: "consistent"; textShowsWork: boolean }
  | { state: "text_mismatch"; textSuggests: Involvement | null }
  | { state: "text_unread" }
  | { state: "no_text" };

export type StructuredAnswer = {
  requirement: Pick<MatchRequirement, "text" | "category">;
  involvement: Involvement;
  alsoDidSome: boolean | null;
  frequency: WorkFrequency | null;
  recency: WorkRecency | null;
  claimedMonths: number | null;
  consistency: Consistency;
  /** The role the answer is attached to, from its dates: how long it lasted and how long ago it ended (null: current). */
  role?: { months: number; endedMonthsAgo: number | null } | null;
  /** Only for a requirement whose split the owner approved (O3). Without `approved: true` the parts are ignored. */
  compound?: { approved: boolean; parts: { part: string; checked: boolean; textShowsWork?: boolean }[] } | null;
};

export type ClarificationReason =
  | "text_mismatch" // the explanation describes a different part than the choice (D1)
  | "role_dates_conflict" // the stated recency can't be true of the role's dates
  | "ask_also_did_some" // a lead choice on a requirement for the work itself, and "did you also do some?" wasn't answered
  | "which_parts" // "I did some of it" with no explanation
  | "missing_compound_parts" // some necessary parts weren't checked (O3)
  | "recency_outside_window" // the requirement asks for recent work and the answer is older (D2)
  | "recency_unclear" // the answer's recency overlaps the requirement's window
  | "needs_specific_text"; // Possible from the choice; Supported would need a specific explanation

export type StructuredReading = {
  verdict: Verdict;
  clarifications: ClarificationReason[];
  /** Plain notes for the person; never a claim that anything was verified. */
  caveats: string[];
  /** Why the verdict is no higher, for tests and audit. */
  limits: string[];
  recencyRequirement: RecencyRequirement & { result: "none" | "met" | "not_met" | "unclear" };
};

const RANK: Record<Verdict, number> = { gap: 0, insufficient_information: 1, possible: 2, supported: 3 };
const lower = (a: Verdict, b: Verdict): Verdict => (RANK[a] <= RANK[b] ? a : b);
const LEAD_CHOICES: Involvement[] = ["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT"];
const REGULAR: WorkFrequency[] = ["MOST_DAYS", "WEEKLY", "MONTHLY"];

// What a requirement asks for, from its own words. These read the requirement, never the person's text.
const ASKS = {
  supervision: /\b(supervis\w*|oversee\w*|oversight|team lead\w*|(lead|leading|led|manag(e|es|ing))\s+(a\s+|the\s+)?(team|teams|crew|crews|staff|shift|people|employees|workers)|people management|direct(ing)?\s+(staff|crews?|employees))\b/i,
  coordination: /\b(coordinat\w*|schedul\w*|arrang\w*|procure\w*|purchas\w*|vendors?|suppliers?|dispatch\w*|record[- ]?keeping|records management|paperwork|documentation|filing|ordering\s+(supplies|parts|materials|inventory|stock)|book(ing)?\s+(travel|appointments|flights))\b/i,
  assisting: /\b(assist(ing|ance)?|assistant|aide|helper|support(ing)?\s+(the\s+|a\s+)?(lead|team|staff|nurses?|physicians?|doctors?|technicians?|engineers?|teachers?))\b/i,
  training: /\b(teach\w*|instruct\w*|mentor\w*|coach\w*|train(ing)?\s+(new\s+|other\s+|junior\s+)?(staff|employees|hires|workers|others|team members|technicians|apprentices|students|users)|onboard(ing)?\s+(new\s+)?(staff|employees|hires))\b/i,
  level: /\b(advanced|expert(ise)?|proficien\w*|senior|fluen(t|cy)|mastery|professional[- ]level|highly skilled)\b/i,
  time: /\b\d+\s*\+?\s*(years?|yrs?|months?)\b|\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(years?|months?)\b/i,
  experience: /\b(experience[ds]?|hands[- ]on|professional|proven|track record|worked as|background in)\b/i,
};
export type RequirementAsks = { supervision: boolean; coordination: boolean; assisting: boolean; training: boolean; level: boolean; time: boolean; experience: boolean };
export function requirementAsks(requirement: Pick<MatchRequirement, "text" | "category">): RequirementAsks {
  const window = explicitRecency(requirement.text).phrase;
  // A recency window ("within the last 2 years") says how recent, not how long: it isn't a time requirement.
  const t = window ? requirement.text.replace(window, " ") : requirement.text;
  return {
    supervision: ASKS.supervision.test(t),
    coordination: ASKS.coordination.test(t),
    assisting: ASKS.assisting.test(t),
    training: ASKS.training.test(t),
    level: ASKS.level.test(t),
    time: ASKS.time.test(t),
    experience: requirement.category === "Experience" || ASKS.experience.test(t),
  };
}

/** Whether a lead choice is itself the kind of work the requirement asks for. */
function choiceIsTheWork(involvement: Involvement, asks: RequirementAsks): boolean {
  switch (involvement) {
    case "SUPERVISED": return asks.supervision;
    case "REQUESTED": return asks.coordination;
    case "ASSISTED": return asks.assisting;
    case "TAUGHT": return asks.training;
    default: return false;
  }
}

/** The answer's recency against an explicit recent-experience requirement (D2). Buckets are months ago: [min, max]. */
const BUCKET: Record<WorkRecency, [number, number]> = { CURRENT: [0, 0], WITHIN_YEAR: [0, 12], ONE_TO_THREE_YEARS: [12, 36], OVER_THREE_YEARS: [36, Infinity] };
export function recencyAgainst(recency: WorkRecency | null, asked: RecencyRequirement): "none" | "met" | "not_met" | "unclear" {
  if (!asked.asks) return "none";
  if (recency === null) return "unclear";
  if (asked.current) return recency === "CURRENT" ? "met" : recency === "WITHIN_YEAR" ? "unclear" : "not_met";
  const [min, max] = BUCKET[recency];
  const window = asked.windowMonths ?? 12; // "recent" with no number: within about a year is met, older is checked below
  if (max <= window) return "met";
  if (asked.windowMonths === null) return recency === "OVER_THREE_YEARS" ? "not_met" : "unclear";
  return min >= window ? "not_met" : "unclear";
}

/** Whether the stated recency can be true of the role's dates. Only clear impossibilities count. */
function recencyFitsRole(recency: WorkRecency | null, role: StructuredAnswer["role"]): boolean {
  if (!role || recency === null) return true;
  const { months, endedMonthsAgo } = role;
  if (endedMonthsAgo === null) return !(recency === "OVER_THREE_YEARS" && months < 36);
  if (recency === "CURRENT") return false;
  if (recency === "WITHIN_YEAR") return endedMonthsAgo <= 12;
  if (recency === "ONE_TO_THREE_YEARS") return endedMonthsAgo <= 36 && endedMonthsAgo + months >= 12;
  return endedMonthsAgo + months >= 36;
}

/** The reading of one choice for one requirement, before any contradiction handling. */
function readChoice(answer: StructuredAnswer, asks: RequirementAsks, textShowsWork: boolean, limits: string[]): Verdict {
  const { involvement } = answer;
  if (involvement === "NOT_DONE") return "gap";
  const asPerformed = involvement === "PERFORMED" || (LEAD_CHOICES.includes(involvement) && choiceIsTheWork(involvement, asks));
  if (asPerformed) {
    if (!textShowsWork) { limits.push("no_specific_text"); return "possible"; }
    if (involvement === "PERFORMED" && !REGULAR.includes(answer.frequency as WorkFrequency)) { limits.push("limited_frequency"); return "possible"; }
    return "supported";
  }
  switch (involvement) {
    case "PART": limits.push("part_only"); return "possible";
    case "TAUGHT": limits.push("taught_not_performed"); return "possible"; // O1: never more for the work itself
    case "ASSISTED": limits.push("assisted_not_performed"); return "possible";
    case "SUPERVISED": limits.push("supervised_not_performed"); return "insufficient_information";
    case "REQUESTED": limits.push("arranged_not_performed"); return "insufficient_information";
    case "OBSERVED_TRAINED":
      limits.push("observed_or_trained");
      return asks.experience || asks.level || asks.time ? "insufficient_information" : "possible";
    default: return "insufficient_information";
  }
}

export function readStructuredAnswer(answer: StructuredAnswer): StructuredReading {
  const asks = requirementAsks(answer.requirement);
  const asked = explicitRecency(answer.requirement.text);
  const recency = recencyAgainst(answer.recency, asked);
  const clarifications = new Set<ClarificationReason>();
  const caveats: string[] = [];
  const limits: string[] = [];
  const { consistency } = answer;
  const result = (verdict: Verdict): StructuredReading => ({ verdict, clarifications: [...clarifications], caveats, limits, recencyRequirement: { ...asked, result: recency } });

  if (answer.involvement === "NOT_DONE") return result("gap");

  // Contradictions among the structured answers themselves: no automatic credit (D1).
  if (!recencyFitsRole(answer.recency, answer.role)) {
    clarifications.add("role_dates_conflict");
    limits.push("role_dates_conflict");
    return result("insufficient_information");
  }

  const textShowsWork = consistency.state === "consistent" && consistency.textShowsWork;
  let verdict = readChoice(answer, asks, textShowsWork, limits);

  // A lead choice on a requirement for the work itself must have been asked "did you also do some?". If it wasn't, ask.
  if (LEAD_CHOICES.includes(answer.involvement) && !choiceIsTheWork(answer.involvement, asks) && answer.alsoDidSome === null) clarifications.add("ask_also_did_some");
  if (answer.involvement === "PART" && consistency.state === "no_text") clarifications.add("which_parts");

  // What the explanation shows (supplied). D3: unread text counts as no text, and is never treated as understood.
  if (consistency.state === "text_unread") {
    verdict = lower(verdict, "possible");
    limits.push("text_not_read");
    caveats.push("Your explanation is kept as you wrote it. It wasn't read, so it can't raise this answer above Possible.");
  }
  if (consistency.state === "text_mismatch") {
    // The more conservative of the two readings, never above Possible, and always a question (D1).
    const suggested = consistency.textSuggests;
    const textReading = suggested ? readChoice({ ...answer, involvement: suggested, alsoDidSome: null }, asks, false, []) : "insufficient_information";
    verdict = lower(lower(verdict, textReading), "possible");
    clarifications.add("text_mismatch");
    limits.push("text_mismatch");
  }

  // Limits that only ever lower.
  if (asks.level || asks.time) {
    if (RANK[verdict] > RANK.possible) limits.push(asks.level ? "level_not_shown_by_answer" : "time_comes_from_dates");
    verdict = lower(verdict, "possible");
    if (asks.level) caveats.push("Your answer shows you've done this. It can't show the level asked for.");
  }
  if (recency === "not_met" || recency === "unclear") {
    if (RANK[verdict] > RANK.possible) limits.push(`recency_${recency}`);
    verdict = lower(verdict, "possible");
    clarifications.add(recency === "not_met" ? "recency_outside_window" : "recency_unclear");
  } else if (recency === "none" && answer.recency === "OVER_THREE_YEARS") {
    caveats.push("Last done more than 3 years ago."); // D2: a note, no loss of credit
  }

  // O3: an approved compound split takes the lowest verdict over its necessary parts.
  if (answer.compound?.approved && answer.compound.parts.length >= 2) {
    const checked = answer.compound.parts.filter(p => p.checked);
    if (checked.length === 0) {
      verdict = lower(verdict, "insufficient_information");
      limits.push("no_compound_part");
    } else {
      // Each checked part needs its own specific text for Supported.
      for (const part of checked) if (!(textShowsWork && part.textShowsWork)) verdict = lower(verdict, "possible");
      if (checked.length < answer.compound.parts.length) {
        verdict = lower(verdict, "possible");
        clarifications.add("missing_compound_parts");
        limits.push("missing_compound_parts");
      }
    }
  }

  // Possible from the choice where Supported would need a specific explanation (only when nothing else blocks it).
  if (verdict === "possible" && limits.includes("no_specific_text") && clarifications.size === 0 && consistency.state !== "text_unread") clarifications.add("needs_specific_text");
  return result(verdict);
}
