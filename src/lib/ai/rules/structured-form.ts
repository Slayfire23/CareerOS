import type { MatchRequirement } from "@/lib/ai/evidence";
import { answerLanguage } from "@/lib/ai/answer-language";
import { approvedSplitFor, type LinkedSplit } from "@/lib/ai/rules/approved-split-link";
import { requirementAsks, type Involvement, type WorkFrequency, type WorkRecency } from "@/lib/ai/rules/structured-answer";
import { CHOICES, FREQUENCIES, LEAD_CHOICES, RECENCIES, fieldsFromSpec, type Fields, type FormSpec } from "@/lib/ai/rules/structured-form-spec";
import { assessConsistency } from "@/lib/ai/rules/structured-consistency";
import { recognizeParts } from "@/lib/ai/rules/split-recognition";

// Phase 5.3 Stage E: the structured "your part" questionnaire (Stage 4A design with D1–D3 and O1; DD2 for approved
// splits; owner decisions E1–E4). Pure: what the form shows, what a submission may contain, and which neutral follow-up
// questions to ask. Nothing here gives a verdict: structured answers are saved but change no verdict until Stage F.
//
// E3: recognition results ("shown", "transferred") and markers are never shown to the person. They only choose which
// plain question to ask. Wording aims at a 6th–8th grade reading level (E4).

export { CHOICES, DETAIL_HINT, FREQUENCIES, RECENCIES, type FormSpec, type Fields } from "@/lib/ai/rules/structured-form-spec";

const LEAD = LEAD_CHOICES;
const DOING: Involvement[] = ["PERFORMED", "PART"];

export type FormContext = { requirement: Pick<MatchRequirement, "text" | "category">; split: LinkedSplit | null };
/** `grouped`: the question covers several requirements, so parts never apply (they belong to one approved wording). */
export const formContext = (requirement: Pick<MatchRequirement, "text" | "category">, grouped = false): FormContext => ({ requirement, split: grouped ? null : approvedSplitFor(requirement.text) });

/** Whether a lead choice is itself the kind of work this requirement asks for (then "did you also do it?" isn't asked). */
function leadIsTheWork(choice: Involvement, context: FormContext): boolean {
  const asks = requirementAsks(context.requirement);
  return (choice === "SUPERVISED" && asks.supervision) || (choice === "REQUESTED" && asks.coordination) || (choice === "ASSISTED" && asks.assisting) || (choice === "TAUGHT" && asks.training);
}

export function formSpec(context: FormContext): FormSpec {
  return { parts: context.split?.parts ?? null, leadAsksAlso: LEAD.filter(c => !leadIsTheWork(c, context)), months: requirementAsks(context.requirement).time };
}

/** Which fields appear for a choice (progressive disclosure, Stage 4A §1–2). `alsoDidSome` is the answer so far. */
export const fieldsFor = (choice: Involvement | null, alsoDidSome: boolean | null, context: FormContext): Fields => fieldsFromSpec(choice, alsoDidSome, formSpec(context));

export type StructuredSubmission = {
  involvement: Involvement;
  alsoDidSome: boolean | null;
  frequency: WorkFrequency | null;
  recency: WorkRecency | null;
  claimedMonths: number | null;
  experienceId: string | null;
  detail: string | null;
  /** The approved parts, with the person's ticks. The wording always comes from the approved list, never the form. */
  parts: { partIndex: number; partText: string; checked: boolean }[];
};
export type RawSubmission = { involvement?: string | null; alsoDidSome?: string | null; frequency?: string | null; recency?: string | null; claimedMonths?: string | null; experienceId?: string | null; detail?: string | null; parts?: string[] };
export type FieldError = { field: keyof RawSubmission | "form"; message: string };

const ONE_OF = <T extends string>(list: readonly { value: T }[], value: string | null | undefined): T | null => (list.find(x => x.value === value)?.value ?? null);

/** Checks a submission against the form's own rules, which are the database's (the structured-fields CHECK). The
 * stored involvement is what the rules read: a lead choice whose person also did some of it is stored as PART. */
export function parseSubmission(raw: RawSubmission, context: FormContext): { ok: true; value: StructuredSubmission } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const chosen = ONE_OF(CHOICES, raw.involvement);
  if (!chosen) return { ok: false, errors: [{ field: "involvement", message: "Choose what your part was." }] };
  const also = raw.alsoDidSome === "yes" ? true : raw.alsoDidSome === "no" ? false : null;
  const fields = fieldsFor(chosen, also, context);
  if (fields.alsoDidSome && also === null) errors.push({ field: "alsoDidSome", message: "Say whether you also did any of it yourself." });
  if (!fields.alsoDidSome && raw.alsoDidSome) errors.push({ field: "alsoDidSome", message: "That question doesn't apply to your choice." });
  const frequency = ONE_OF(FREQUENCIES, raw.frequency);
  const recency = ONE_OF(RECENCIES, raw.recency);
  if (fields.frequency && !frequency) errors.push({ field: "frequency", message: "Choose how often." });
  if (!fields.frequency && raw.frequency) errors.push({ field: "frequency", message: "How often doesn't apply to your choice." });
  if (fields.recency && !recency) errors.push({ field: "recency", message: "Choose when you last did it." });
  if (!fields.recency && raw.recency) errors.push({ field: "recency", message: "When you last did it doesn't apply to your choice." });
  const experienceId = raw.experienceId?.trim() || null;
  if (fields.role && !experienceId) errors.push({ field: "experienceId", message: "Choose a role." });
  if (!fields.role && experienceId) errors.push({ field: "experienceId", message: "A role doesn't apply to your choice." });
  let claimedMonths: number | null = null;
  if (raw.claimedMonths?.trim()) {
    if (!fields.months) errors.push({ field: "claimedMonths", message: "How long doesn't apply here." });
    else if (!/^\d{1,3}$/.test(raw.claimedMonths.trim()) || Number(raw.claimedMonths) < 1 || Number(raw.claimedMonths) > 720) errors.push({ field: "claimedMonths", message: "Enter a number of months from 1 to 720." });
    else claimedMonths = Number(raw.claimedMonths);
  }
  const detail = raw.detail?.trim() || null;
  if (detail && !fields.detail) errors.push({ field: "detail", message: "A description doesn't apply to your choice." });
  let parts: StructuredSubmission["parts"] = [];
  const ticked = raw.parts ?? [];
  if (fields.parts && context.split) {
    const indexes = new Set<number>();
    for (const t of ticked) {
      if (!/^\d$/.test(t) || Number(t) >= context.split.parts.length) { errors.push({ field: "parts", message: "Choose from the listed parts." }); break; }
      indexes.add(Number(t));
    }
    parts = context.split.parts.map((text, i) => ({ partIndex: i, partText: text, checked: indexes.has(i) }));
  } else if (ticked.length) errors.push({ field: "parts", message: "Parts don't apply to your choice." });
  if (errors.length) return { ok: false, errors };
  // Stored as the rules read it: "supervised it, and also did some" is PART with alsoDidSome = true.
  const leadAlso = LEAD.includes(chosen) && also === true;
  return {
    ok: true,
    value: {
      involvement: leadAlso ? "PART" : chosen,
      alsoDidSome: fields.alsoDidSome ? also : null,
      frequency: fields.frequency ? frequency : null,
      recency: fields.recency ? recency : null,
      claimedMonths,
      experienceId: fields.role ? experienceId : null,
      detail: fields.detail ? detail : null,
      parts,
    },
  };
}

export type TargetedQuestion =
  | { kind: "what_did_you_do"; partIndex: number; part: string; text: string }
  | { kind: "others_did_it"; partIndex: number; part: string; text: string }
  | { kind: "mismatch"; text: string }
  | { kind: "not_read"; text: string };

/** The plain questions for one saved structured answer. They name the part, never what the reader found or how.
 * A part already asked about (`done`) is never asked again. */
export function targetedQuestions(answer: { involvement: Involvement; detail: string | null; parts: { partIndex: number; partText: string; checked: boolean }[] }, context: FormContext, done: ReadonlySet<number> = new Set()): TargetedQuestion[] {
  if (answer.involvement === "NOT_DONE") return [];
  const out: TargetedQuestion[] = [];
  const detail = answer.detail?.trim() ?? "";
  if (detail && answerLanguage(detail) !== "en") return [{ kind: "not_read", text: "We can't read this description, so your choice counts on its own." }];
  if (detail) {
    const consistency = assessConsistency({ requirement: context.requirement, involvement: answer.involvement, explanation: detail });
    if (consistency.consistency.state === "text_mismatch") {
      out.push({ kind: "mismatch", text: consistency.consistency.textSuggests === null
        ? "Your description says someone else did this work, or that you didn't. You can change your choice or your description."
        : "Your description sounds different from the part you chose. You can change your choice or your description." });
    }
  }
  if (!context.split || !DOING.includes(answer.involvement)) return out;
  const reading = detail ? recognizeParts({ splitId: context.split.splitId, explanation: detail }) : null;
  for (const part of answer.parts) {
    if (!part.checked || done.has(part.partIndex)) continue;
    const r = reading?.parts[part.partIndex];
    if (r?.shown) continue;
    out.push(r?.transferred
      ? { kind: "others_did_it", partIndex: part.partIndex, part: part.partText, text: `Your description mentions other people doing “${part.partText}”. Did you also do some of it yourself?` }
      : { kind: "what_did_you_do", partIndex: part.partIndex, part: part.partText, text: `You ticked “${part.partText}”. What did you do yourself?` });
  }
  return out;
}
