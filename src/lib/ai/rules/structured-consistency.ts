import { answerLanguage } from "@/lib/ai/answer-language";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements, DEFAULT_TEXT_RULES, isV21Family, othersParts, othersText, retractions, statesIntent, type Ownership, type TextRules } from "@/lib/ai/evidence-boundary";
import { deniesRequirement, othersDoWholeRequirement, ownDirectAct, readAnswer } from "@/lib/ai/rules/answer-review";
import type { Consistency, Involvement } from "@/lib/ai/rules/structured-answer";
import { laterOwnDenial, othersDoActivityOnly, unhandledWithdrawals, withdrawsActivity, withoutWithdrawn } from "@/lib/ai/rules/structured-ownership-guards";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

// Structured ownership (Phase 5.3 Stage 3): what an explanation shows relative to the person's choice (design §3). Produces
// the consistency state the Stage 2 rule table takes as input. Deterministic, rules-v20 text reading, no model.
// Not connected to any workflow yet (Stages 5–6). It never raises a verdict: a mismatch can only keep one lower and ask.
//
// D3: text that isn't plainly English is never read: it's "text_unread", and nothing below looks at it.
//
// rules-v21 (Stage B; the default since 2026-11-13, `textRules` picks another): reads with rules-v21; the person's own direct hiring, approving or
// verifying act counts as doing it where the requirement asks for that act (F5); and when the explanation says someone
// else performed the requirement's work and shows none of the person's own, the activity is contradicted: no checkbox
// credit, not even Possible (F6, D1).
//
// Consistency version 2 (post-Stage G Gate A; read by structured matching v2, the default; version 1 stays selectable for comparison only).
// Structured answers only: the shared reader and the free-text path are unchanged.
//   A1: an explanation with instructions to the evaluator is untrusted. It is no longer handled as "no text" (which left
//       the choice's own Possible standing): it contradicts the answer, no automatic credit, ask.
//   A3: a correction that withdraws the person's earlier claim about this activity, to someone else or by a denial, takes
//       that claim away. Nothing left that shows the activity: contradicted. Something left: Possible at most, ask.
//   A2: someone else is said to do this activity (including the passive, "is operated by my coworker") and none of the
//       person's own doing statements touches it: contradicted, even when the person describes other, unrelated work.
export type ConsistencyVersion = 1 | 2;
export const CONSISTENCY_VERSION: ConsistencyVersion = 2;

const FROM_OWNERSHIP: Record<Ownership, Involvement> = {
  performed: "PERFORMED", oversaw: "SUPERVISED", requested: "REQUESTED", assisted: "ASSISTED", observed: "OBSERVED_TRAINED", taught: "TAUGHT",
};
const DOING: Involvement[] = ["PERFORMED", "PART"];

export type ConsistencyResult = {
  consistency: Consistency;
  /** What the explanation shows the person's part to be, when it shows one. */
  textInvolvement: Involvement | null;
  /** Instructions, templates or other text the reader refuses: it gives nothing and is handled as no text. */
  refused: boolean;
  reason: "no_text" | "not_english" | "refused" | "consistent" | "mismatch" | "nothing_about_own_part" | "someone_else_did_it" | "denies_doing_it" | "withdrawn" | "withdrawn_partly";
};

/** The person's part as the explanation shows it, or null when it shows none. */
function partShownByText(text: string, rules: TextRules, requirementText: string): { involvement: Involvement | null; why: string } {
  const v21 = isV21Family(rules);
  const statements = answerStatements(text, rules).map(s => (v21 && s.ownership === "oversaw" && ownDirectAct(requirementText, s.text) ? { ...s, ownership: "performed" as const } : s));
  // rules-v21 (F4): a narrowed statement ("…, I only draft the reports") is the person's own work, limited in scope: doing
  // it, never exposure. The scope limit stays with the reading (it can't show the whole requirement).
  const doing = (s: (typeof statements)[number]) => s.ownership === "performed" && (!s.exposureOnly || !!s.narrowed) && !s.brief;
  if (statements.some(s => doing(s) && s.subject === "self")) return { involvement: "PERFORMED", why: "own work" };
  const first = statements.find(s => s.subject === "self");
  if (first) return { involvement: first.brief || (first.exposureOnly && !first.narrowed) ? "OBSERVED_TRAINED" : FROM_OWNERSHIP[first.ownership], why: "own statement" };
  // No statement of the person's own: learning or intending to, or someone else did it.
  if (statesIntent(text)) return { involvement: "OBSERVED_TRAINED", why: "learning or intending" };
  if ((rules === "v22" ? othersParts(text, false, true, false, true).join(" ") : othersText(text)).trim()) return { involvement: null, why: "someone else did it" };
  return { involvement: null, why: "no own statement" };
}

export function assessConsistency(input: { requirement: Pick<MatchRequirement, "text" | "category">; involvement: Involvement; explanation: string | null; textRules?: TextRules; version?: ConsistencyVersion }): ConsistencyResult {
  const rules: TextRules = input.textRules ?? DEFAULT_TEXT_RULES;
  const v21 = isV21Family(rules);
  const v2 = (input.version ?? CONSISTENCY_VERSION) === 2;
  const text = input.explanation?.trim() ?? "";
  if (!text) return { consistency: { state: "no_text" }, textInvolvement: null, refused: false, reason: "no_text" };
  if (answerLanguage(text) !== "en") return { consistency: { state: "text_unread" }, textInvolvement: null, refused: false, reason: "not_english" };
  // A1 (v2): untrusted, not absent. v1 handled it as no text, so the choice alone still gave Possible.
  if (hasDirectedText(text)) return v2
    ? { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: "untrusted_text" }, textInvolvement: null, refused: true, reason: "refused" }
    : { consistency: { state: "no_text" }, textInvolvement: null, refused: true, reason: "refused" };
  if (input.involvement === "NOT_DONE") return { consistency: { state: "no_text" }, textInvolvement: null, refused: false, reason: "no_text" };

  const requirement: MatchRequirement = { index: 0, text: input.requirement.text, category: input.requirement.category, priority: "Required" };
  const showsWork = () => readAnswer(requirement, text, { textRules: rules }).verdict === "supported";
  const choiceDoes = DOING.includes(input.involvement);
  // A3 (v2): a correction withdraws the person's claim about this activity, or a later own denial contradicts it.
  if (v2) {
    const handled = retractions(text, v21);
    const withdrawn = withdrawsActivity(requirement.text, text, handled);
    const denial = withdrawn ? false : laterOwnDenial(requirement.text, text);
    if (withdrawn || denial) {
      const by = withdrawn?.by ?? "own_denial";
      const left = withdrawn ? withoutWithdrawn(text, unhandledWithdrawals(text, handled)) : "";
      if (!left.trim() || readAnswer(requirement, left, { textRules: rules }).verdict === "insufficient_information") return { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: by }, textInvolvement: null, refused: false, reason: "withdrawn" };
      // Something of the person's own on this activity is left: never more than Possible from this answer, and ask.
      return { consistency: { state: "text_mismatch", textSuggests: choiceDoes ? "PERFORMED" : input.involvement }, textInvolvement: null, refused: false, reason: "withdrawn_partly" };
    }
  }
  // F6: the explanation gives this activity to someone else, or the person's own words deny doing it, and it shows none of
  // the person's own work on it: contradicted, no checkbox credit (D1).
  if (v21 && choiceDoes && readAnswer(requirement, text, { textRules: rules }).verdict === "insufficient_information") {
    if (othersDoWholeRequirement(requirement.text, text, rules === "v22")) return { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: "other_person" }, textInvolvement: null, refused: false, reason: "someone_else_did_it" };
    if (deniesRequirement(requirement.text, text)) return { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: "own_denial" }, textInvolvement: null, refused: false, reason: "denies_doing_it" };
    // A2 (v2): someone else does this activity, and only unrelated work of the person's own is described.
    // Not where the shared reader already handled a correction and the person still states a part of their own: that is
    // a correction that narrows ownership ("Actually no, I write up the notes and the manager does the reviews").
    const narrowing = retractions(text, v21).length > 0 && answerStatements(text, rules).some(s => s.subject === "self");
    if (v2 && !narrowing && othersDoActivityOnly(requirement.text, text, rules, rules === "v22")) return { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: "other_person" }, textInvolvement: null, refused: false, reason: "someone_else_did_it" };
  }

  const shown = partShownByText(text, rules, requirement.text);

  if (shown.involvement === null) {
    // "Did it myself" with an explanation that never says the person did anything: no automatic credit, ask (D1).
    if (choiceDoes) return { consistency: { state: "text_mismatch", textSuggests: null }, textInvolvement: null, refused: false, reason: "mismatch" };
    return { consistency: { state: "consistent", textShowsWork: false }, textInvolvement: null, refused: false, reason: "nothing_about_own_part" };
  }
  const agrees = choiceDoes ? shown.involvement === "PERFORMED" : shown.involvement === input.involvement;
  if (agrees) return { consistency: { state: "consistent", textShowsWork: showsWork() }, textInvolvement: shown.involvement, refused: false, reason: "consistent" };
  // A lead choice whose text shows doing it keeps the choice's reading (the rule table takes the more conservative one) and
  // asks "did you also do some of it yourself?"; any other disagreement keeps the lower reading and asks.
  return { consistency: { state: "text_mismatch", textSuggests: shown.involvement }, textInvolvement: shown.involvement, refused: false, reason: "mismatch" };
}
