import type { Involvement, WorkFrequency, WorkRecency } from "@/lib/ai/rules/structured-answer";

// Phase 5.3 Stage E: the parts of the structured form the browser needs. No reader, no recognition, no requirement
// parsing: the server sends a `FormSpec` per question, and these say which fields each choice shows. The server checks
// every submission again with the same rules (structured-form.ts), which are the database's own.

export const CHOICES: readonly { value: Involvement; label: string }[] = [
  { value: "PERFORMED", label: "I did this work myself" },
  { value: "PART", label: "I did some of it myself" },
  { value: "SUPERVISED", label: "I supervised it or assigned it to others" },
  { value: "REQUESTED", label: "I arranged it, or requested it from a contractor or provider" },
  { value: "ASSISTED", label: "I helped someone who did it" },
  { value: "TAUGHT", label: "I taught or trained others to do it" },
  { value: "OBSERVED_TRAINED", label: "I watched it being done, or trained on it" },
  { value: "NOT_DONE", label: "Actually, I haven't done this" },
];
export const FREQUENCIES: readonly { value: WorkFrequency; label: string }[] = [
  { value: "MOST_DAYS", label: "Most days or shifts" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "FEW_TIMES", label: "A few times in total" },
  { value: "ONCE", label: "Once" },
];
export const RECENCIES: readonly { value: WorkRecency; label: string }[] = [
  { value: "CURRENT", label: "It's part of my job now" },
  { value: "WITHIN_YEAR", label: "Within the last year" },
  { value: "ONE_TO_THREE_YEARS", label: "1–3 years ago" },
  { value: "OVER_THREE_YEARS", label: "More than 3 years ago" },
];
export const DETAIL_HINT = "Say what you did yourself, on what, and how often. Plain words are fine.";
export const SUPERVISING_NOTE = "We'll show this as supervising or arranging the work, not doing it yourself.";

export const LEAD_CHOICES: readonly Involvement[] = ["SUPERVISED", "REQUESTED", "ASSISTED", "TAUGHT"];
const DOING: readonly Involvement[] = ["PERFORMED", "PART"];

/** For one requirement: its approved parts (null: asked as one requirement), the lead choices that ask "Did you also
 * do any of it yourself?", and whether "About how long in total?" is asked. */
export type FormSpec = { parts: readonly string[] | null; leadAsksAlso: Involvement[]; months: boolean };
export type Fields = { alsoDidSome: boolean; frequency: boolean; recency: boolean; role: boolean; months: boolean; parts: boolean; detail: boolean };

/** Which fields appear for a choice (progressive disclosure). `alsoDidSome` is the answer so far. */
export function fieldsFromSpec(choice: Involvement | null, alsoDidSome: boolean | null, spec: FormSpec): Fields {
  const none: Fields = { alsoDidSome: false, frequency: false, recency: false, role: false, months: false, parts: false, detail: false };
  if (!choice || choice === "NOT_DONE") return none;
  const asksAlso = spec.leadAsksAlso.includes(choice);
  const doing = DOING.includes(choice) || (asksAlso && alsoDidSome === true);
  return { alsoDidSome: asksAlso, frequency: doing, recency: doing, role: true, months: doing && spec.months, parts: doing && spec.parts !== null, detail: true };
}
