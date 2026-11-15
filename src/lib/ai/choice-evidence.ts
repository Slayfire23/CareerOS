import type { Involvement, WorkFrequency, WorkRecency } from "@/lib/ai/rules/structured-answer";
import { CHOICES, FREQUENCIES, RECENCIES } from "@/lib/ai/rules/structured-form-spec";

// Phase 5.3 Stage F3 (decision F-4): the evidence a structured choice gives, for a `candidate_choice` result.
//
// A choice is what the person selected in the structured form ("I did this work myself", "Weekly", …). It is a
// self-reported claim, never verified, and never the person's own words. So its evidence item:
//   - has its own kind, "choice", and its own id, `choice:<answer id>`: it can't pass for resume, profile, role or answer
//     text (`experience:<id>`), and the rules engine and AI providers never receive it (it isn't in `evidence`);
//   - carries one fixed text, written by CareerOS from the choice and labelled as self-reported, not independently verified. A
//     citation of it must quote exactly that text, so nothing can present a choice as something the person wrote;
//   - supports Possible at most (the validator enforces it).
// Pure: no database, no flags. Nothing in the application builds choice evidence yet (Stage F4 wires it).

export type ChoiceEvidence = {
  id: string;
  kind: "choice";
  /** The structured answer (CandidateClarification id) this choice belongs to. */
  answer_id: string;
  involvement: Involvement;
  frequency: WorkFrequency | null;
  recency: WorkRecency | null;
  /** CareerOS's wording of the choice; the only text a citation may quote. */
  statement: string;
};

export const CHOICE_PREFIX = "choice:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const choiceEvidenceId = (answerId: string) => `${CHOICE_PREFIX}${answerId}`;
export const isChoiceEvidenceId = (evidenceId: string) => evidenceId.startsWith(CHOICE_PREFIX);

const label = <T extends string>(list: readonly { value: T; label: string }[], value: T | null) => (value === null ? null : list.find(x => x.value === value)?.label ?? null);

/** CareerOS's fixed wording of a choice: the form's own labels, introduced as self-reported and not independently verified. */
export function choiceStatement(choice: { involvement: Involvement; frequency: WorkFrequency | null; recency: WorkRecency | null }): string {
  const parts = [`Choice: ${label(CHOICES, choice.involvement)}`];
  const often = label(FREQUENCIES, choice.frequency);
  const when = label(RECENCIES, choice.recency);
  if (often) parts.push(`How often: ${often}`);
  if (when) parts.push(`Most recently: ${when}`);
  return `Structured answer, self-reported: CareerOS hasn't independently verified it. ${parts.join(". ")}.`;
}

/** The choice evidence for a structured answer, or null when there is none to give (a "haven't done this", or
 * anything that isn't a valid choice). */
export function buildChoiceEvidence(answer: { id: string; involvement: string | null; frequency: string | null; recency: string | null }): ChoiceEvidence | null {
  if (!UUID.test(answer.id)) return null;
  const involvement = CHOICES.find(c => c.value === answer.involvement)?.value;
  if (!involvement || involvement === "NOT_DONE") return null;
  const frequency = answer.frequency === null ? null : FREQUENCIES.find(f => f.value === answer.frequency)?.value;
  const recency = answer.recency === null ? null : RECENCIES.find(r => r.value === answer.recency)?.value;
  if (frequency === undefined || recency === undefined) return null;
  return { id: choiceEvidenceId(answer.id), kind: "choice", answer_id: answer.id, involvement, frequency, recency, statement: choiceStatement({ involvement, frequency, recency }) };
}

/** Whether a choice evidence item is exactly what CareerOS would build for its answer (no edited id or wording). */
export function choiceEvidenceIsIntact(item: ChoiceEvidence): boolean {
  const rebuilt = buildChoiceEvidence({ id: item.answer_id, involvement: item.involvement, frequency: item.frequency, recency: item.recency });
  return !!rebuilt && item.kind === "choice" && item.id === rebuilt.id && item.statement === rebuilt.statement;
}

/** The citation a `candidate_choice` result gives: the choice item, quoting its fixed wording. */
export const choiceCitation = (item: ChoiceEvidence) => ({ evidence_id: item.id, quote: item.statement });

/** Whether a stored citation rests on an answer that no longer counts. `lapsed` holds the answers' own evidence ids
 * (`experience:<id>`, set on every role answer since Stage F1); a choice citation (`choice:<id>`) lapses with its answer. */
export function citesLapsedAnswer(evidenceId: string, lapsed: ReadonlySet<string>): boolean {
  if (lapsed.has(evidenceId)) return true;
  return isChoiceEvidenceId(evidenceId) && lapsed.has(`experience:${evidenceId.slice(CHOICE_PREFIX.length)}`);
}

/** Every evidence id a stored citation of this answer could carry. */
export const answerCitationIds = (answerId: string) => [`experience:${answerId}`, choiceEvidenceId(answerId)];
