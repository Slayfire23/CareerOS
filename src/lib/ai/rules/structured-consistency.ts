import { answerLanguage } from "@/lib/ai/answer-language";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements, DEFAULT_TEXT_RULES, othersText, statesIntent, type Ownership, type TextRules } from "@/lib/ai/evidence-boundary";
import { deniesRequirement, othersDoWholeRequirement, ownDirectAct, readAnswer } from "@/lib/ai/rules/answer-review";
import type { Consistency, Involvement } from "@/lib/ai/rules/structured-answer";
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
  reason: "no_text" | "not_english" | "refused" | "consistent" | "mismatch" | "nothing_about_own_part" | "someone_else_did_it" | "denies_doing_it";
};

/** The person's part as the explanation shows it, or null when it shows none. */
function partShownByText(text: string, rules: TextRules, requirementText: string): { involvement: Involvement | null; why: string } {
  const v21 = rules === "v21";
  const statements = answerStatements(text, rules).map(s => (v21 && s.ownership === "oversaw" && ownDirectAct(requirementText, s.text) ? { ...s, ownership: "performed" as const } : s));
  // rules-v21 (F4): a narrowed statement ("…, I only draft the reports") is the person's own work, limited in scope: doing
  // it, never exposure. The scope limit stays with the reading (it can't show the whole requirement).
  const doing = (s: (typeof statements)[number]) => s.ownership === "performed" && (!s.exposureOnly || !!s.narrowed) && !s.brief;
  if (statements.some(s => doing(s) && s.subject === "self")) return { involvement: "PERFORMED", why: "own work" };
  const first = statements.find(s => s.subject === "self");
  if (first) return { involvement: first.brief || (first.exposureOnly && !first.narrowed) ? "OBSERVED_TRAINED" : FROM_OWNERSHIP[first.ownership], why: "own statement" };
  // No statement of the person's own: learning or intending to, or someone else did it.
  if (statesIntent(text)) return { involvement: "OBSERVED_TRAINED", why: "learning or intending" };
  if (othersText(text).trim()) return { involvement: null, why: "someone else did it" };
  return { involvement: null, why: "no own statement" };
}

export function assessConsistency(input: { requirement: Pick<MatchRequirement, "text" | "category">; involvement: Involvement; explanation: string | null; textRules?: TextRules }): ConsistencyResult {
  const rules: TextRules = input.textRules ?? DEFAULT_TEXT_RULES;
  const v21 = rules === "v21";
  const text = input.explanation?.trim() ?? "";
  if (!text) return { consistency: { state: "no_text" }, textInvolvement: null, refused: false, reason: "no_text" };
  if (answerLanguage(text) !== "en") return { consistency: { state: "text_unread" }, textInvolvement: null, refused: false, reason: "not_english" };
  if (hasDirectedText(text)) return { consistency: { state: "no_text" }, textInvolvement: null, refused: true, reason: "refused" };
  if (input.involvement === "NOT_DONE") return { consistency: { state: "no_text" }, textInvolvement: null, refused: false, reason: "no_text" };

  const requirement: MatchRequirement = { index: 0, text: input.requirement.text, category: input.requirement.category, priority: "Required" };
  const showsWork = () => readAnswer(requirement, text, { textRules: rules }).verdict === "supported";
  const choiceDoes = DOING.includes(input.involvement);
  // F6: the explanation gives this activity to someone else, or the person's own words deny doing it, and it shows none of
  // the person's own work on it: contradicted, no checkbox credit (D1).
  if (v21 && choiceDoes && readAnswer(requirement, text, { textRules: rules }).verdict === "insufficient_information") {
    if (othersDoWholeRequirement(requirement.text, text)) return { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: "other_person" }, textInvolvement: null, refused: false, reason: "someone_else_did_it" };
    if (deniesRequirement(requirement.text, text)) return { consistency: { state: "text_mismatch", textSuggests: null, contradictedBy: "own_denial" }, textInvolvement: null, refused: false, reason: "denies_doing_it" };
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
