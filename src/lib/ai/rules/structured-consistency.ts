import { answerLanguage } from "@/lib/ai/answer-language";
import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerStatements, othersText, statesIntent, type Ownership } from "@/lib/ai/evidence-boundary";
import { readAnswer } from "@/lib/ai/rules/answer-review";
import type { Consistency, Involvement } from "@/lib/ai/rules/structured-answer";
import { hasDirectedText } from "@/lib/ai/untrusted-text";

// Structured ownership (Phase 5.3 Stage 3): what an explanation shows relative to the person's choice (design §3). Produces
// the consistency state the Stage 2 rule table takes as input. Deterministic, rules-v20 text reading, no model.
// Not connected to any workflow yet (Stages 5–6). It never raises a verdict: a mismatch can only keep one lower and ask.
//
// D3: text that isn't plainly English is never read: it's "text_unread", and nothing below looks at it.

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
  reason: "no_text" | "not_english" | "refused" | "consistent" | "mismatch" | "nothing_about_own_part";
};

/** The person's part as the explanation shows it, or null when it shows none. */
function partShownByText(text: string): { involvement: Involvement | null; why: string } {
  const statements = answerStatements(text, "v20");
  if (statements.some(s => s.ownership === "performed" && !s.exposureOnly && !s.brief && s.subject === "self")) return { involvement: "PERFORMED", why: "own work" };
  const first = statements.find(s => s.subject === "self");
  if (first) return { involvement: first.brief || first.exposureOnly ? "OBSERVED_TRAINED" : FROM_OWNERSHIP[first.ownership], why: "own statement" };
  // No statement of the person's own: learning or intending to, or someone else did it.
  if (statesIntent(text)) return { involvement: "OBSERVED_TRAINED", why: "learning or intending" };
  if (othersText(text).trim()) return { involvement: null, why: "someone else did it" };
  return { involvement: null, why: "no own statement" };
}

export function assessConsistency(input: { requirement: Pick<MatchRequirement, "text" | "category">; involvement: Involvement; explanation: string | null }): ConsistencyResult {
  const text = input.explanation?.trim() ?? "";
  if (!text) return { consistency: { state: "no_text" }, textInvolvement: null, refused: false, reason: "no_text" };
  if (answerLanguage(text) !== "en") return { consistency: { state: "text_unread" }, textInvolvement: null, refused: false, reason: "not_english" };
  if (hasDirectedText(text)) return { consistency: { state: "no_text" }, textInvolvement: null, refused: true, reason: "refused" };
  if (input.involvement === "NOT_DONE") return { consistency: { state: "no_text" }, textInvolvement: null, refused: false, reason: "no_text" };

  const shown = partShownByText(text);
  const requirement: MatchRequirement = { index: 0, text: input.requirement.text, category: input.requirement.category, priority: "Required" };
  const showsWork = () => readAnswer(requirement, text, { textRules: "v20" }).verdict === "supported";
  const choiceDoes = DOING.includes(input.involvement);

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
