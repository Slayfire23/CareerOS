"use client";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { reviewCorrectStructured, reviewPartQuestion, reviewSaveStructured, type StructuredState } from "@/app/jobs/review-actions";
import { DETAIL_MAX } from "@/lib/ai/rules/clarification-limits";
import type { Involvement } from "@/lib/ai/rules/structured-answer";
import { CHOICES, DETAIL_HINT, FREQUENCIES, RECENCIES, SUPERVISING_NOTE, fieldsFromSpec, matchEffect, type FormSpec } from "@/lib/ai/rules/structured-form-spec";
import { SECTIONS } from "@/lib/sections";

// Phase 5.3 Stage E: the structured "your part" form (flag STRUCTURED_OWNERSHIP_FORM_ENABLED, local only). Native
// controls in fieldsets with legends, labels on every control, errors listed at the top (focused) and next to each field,
// one column on small screens, and nothing preselected. It never shows what the reader found (owner decision E3).

const NOTE = (counts: boolean | undefined) => `Saved to your profile as self-reported. CareerOS doesn't independently check it, so only add what's accurate. ${matchEffect(counts)}`;
const option = "flex min-h-11 items-center gap-3 rounded-md px-2 text-sm";

export type StructuredInitial = { involvement: Involvement; alsoDidSome: boolean | null; frequency: string | null; recency: string | null; claimedMonths: number | null; experienceId: string | null; detail: string | null; checkedParts: number[] };

type Props = { spec: FormSpec; roles: { id: string; label: string }[]; requirementText: string }
  & ({ mode: "new"; analysisId: string; questionKey: string } | { mode: "correct"; clarificationId: string; initial: StructuredInitial; partQuestion?: number; onDone?: () => void });

export function StructuredAnswerForm(props: Props) {
  const id = useId();
  const [state, action, pending] = useActionState(props.mode === "new" ? reviewSaveStructured : reviewCorrectStructured, {} as StructuredState);
  const initial = props.mode === "correct" ? props.initial : null;
  // Kept here because a form resets after its action, and a turned-away answer shouldn't lose what was chosen or typed.
  const [choice, setChoice] = useState<Involvement | null>(initial?.involvement ?? null);
  const [also, setAlso] = useState<boolean | null>(initial?.alsoDidSome ?? null);
  const [frequency, setFrequency] = useState(initial?.frequency ?? "");
  const [recency, setRecency] = useState(initial?.recency ?? "");
  const [months, setMonths] = useState(initial?.claimedMonths?.toString() ?? "");
  const [role, setRole] = useState(initial?.experienceId ?? "");
  const [detail, setDetail] = useState(initial?.detail ?? "");
  const [parts, setParts] = useState<Set<number>>(new Set(initial?.checkedParts ?? []));
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.error) summary.current?.focus(); }, [state]);
  const fields = fieldsFromSpec(choice, also, props.spec);
  const errors = state.fieldErrors ?? {};
  const err = (field: string) => errors[field] ? `${id}-${field}-error` : undefined;
  const describe = (...ids: (string | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;
  const fieldError = (field: string) => errors[field] ? <p id={`${id}-${field}-error`} className="text-sm font-medium text-danger-text">{errors[field]}</p> : null;
  const lead = choice !== null && !["PERFORMED", "PART", "NOT_DONE"].includes(choice);

  return <form action={action} aria-label={props.mode === "new" ? "Your part" : `Change your answer about ${props.requirementText}`} className="space-y-4" noValidate>
    {props.mode === "new" ? <>
      <input type="hidden" name="analysisId" value={props.analysisId} />
      <input type="hidden" name="questionKey" value={props.questionKey} />
    </> : <>
      <input type="hidden" name="clarificationId" value={props.clarificationId} />
      {props.partQuestion !== undefined && <input type="hidden" name="partQuestion" value={props.partQuestion} />}
    </>}

    {state.error && <div ref={summary} tabIndex={-1} role="alert" className="rounded-md border border-danger-text bg-danger-soft p-3 text-sm text-danger-text">
      <p className="font-medium">{state.error}</p>
      {Object.keys(errors).length > 0 && <ul className="mt-1 list-disc pl-5">
        {Object.entries(errors).map(([field, message]) => <li key={field}><a href={`#${id}-${field}`} className="underline">{message}</a></li>)}
      </ul>}
    </div>}

    <fieldset id={`${id}-involvement`} aria-describedby={err("involvement")} aria-invalid={errors.involvement ? true : undefined} className="space-y-1">
      <legend className="label">What was your part? <span className="font-normal text-muted">(choose one)</span></legend>
      {fieldError("involvement")}
      {CHOICES.map(c => <label key={c.value} className={option}>
        <input type="radio" name="involvement" value={c.value} checked={choice === c.value} onChange={() => { setChoice(c.value); setAlso(null); }} className="size-5" />
        {c.label}
      </label>)}
    </fieldset>

    {fields.alsoDidSome && <fieldset id={`${id}-alsoDidSome`} aria-describedby={err("alsoDidSome")} aria-invalid={errors.alsoDidSome ? true : undefined} className="space-y-1">
      <legend className="label">Did you also do any of it yourself?</legend>
      {fieldError("alsoDidSome")}
      <label className={option}><input type="radio" name="alsoDidSome" value="yes" checked={also === true} onChange={() => setAlso(true)} className="size-5" />Yes</label>
      <label className={option}><input type="radio" name="alsoDidSome" value="no" checked={also === false} onChange={() => setAlso(false)} className="size-5" />No</label>
    </fieldset>}
    {lead && (!fields.alsoDidSome || also === false) && <p className="hint">{SUPERVISING_NOTE}</p>}

    {fields.parts && props.spec.parts && <fieldset id={`${id}-parts`} aria-describedby={describe(`${id}-parts-hint`, err("parts"))} aria-invalid={errors.parts ? true : undefined} className="space-y-1">
      <legend className="label">Which of these did you do yourself? <span className="font-normal text-muted">(tick all that apply)</span></legend>
      <p id={`${id}-parts-hint`} className="hint">Leave a box empty if someone else did that part.</p>
      {fieldError("parts")}
      {props.spec.parts.map((p, i) => <label key={p} className={option}>
        <input type="checkbox" name="part" value={i} checked={parts.has(i)} onChange={e => setParts(prev => { const next = new Set(prev); if (e.target.checked) next.add(i); else next.delete(i); return next; })} className="size-5" />
        {p}
      </label>)}
    </fieldset>}

    {fields.frequency && <fieldset id={`${id}-frequency`} aria-describedby={err("frequency")} aria-invalid={errors.frequency ? true : undefined} className="space-y-1">
      <legend className="label">How often?</legend>
      {fieldError("frequency")}
      {FREQUENCIES.map(f => <label key={f.value} className={option}><input type="radio" name="frequency" value={f.value} checked={frequency === f.value} onChange={() => setFrequency(f.value)} className="size-5" />{f.label}</label>)}
    </fieldset>}

    {fields.recency && <fieldset id={`${id}-recency`} aria-describedby={err("recency")} aria-invalid={errors.recency ? true : undefined} className="space-y-1">
      <legend className="label">Most recently?</legend>
      {fieldError("recency")}
      {RECENCIES.map(r => <label key={r.value} className={option}><input type="radio" name="recency" value={r.value} checked={recency === r.value} onChange={() => setRecency(r.value)} className="size-5" />{r.label}</label>)}
    </fieldset>}

    {fields.role && (props.roles.length
      ? <div className="space-y-1">
        <label className="label" htmlFor={`${id}-experienceId`}>Which role?</label>
        {fieldError("experienceId")}
        <select id={`${id}-experienceId`} name="experienceId" className="field min-h-11" value={role} onChange={e => setRole(e.target.value)} aria-describedby={err("experienceId")} aria-invalid={errors.experienceId ? true : undefined}>
          <option value="" disabled>Choose a role</option>
          {props.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </div>
      : <p className="text-sm">Add the job in <Link href={SECTIONS.experience.href} className="font-medium text-accent-text underline">Experience</Link> first, then answer this.</p>)}

    {fields.months && <div className="space-y-1">
      <label className="label" htmlFor={`${id}-claimedMonths`}>About how long in total, in months? <span className="font-normal text-muted">(optional)</span></label>
      {fieldError("claimedMonths")}
      <input id={`${id}-claimedMonths`} name="claimedMonths" inputMode="numeric" pattern="[0-9]*" maxLength={3} className="field min-h-11" value={months} onChange={e => setMonths(e.target.value)} aria-describedby={err("claimedMonths")} aria-invalid={errors.claimedMonths ? true : undefined} />
    </div>}

    {fields.detail && <div className="space-y-1">
      <label className="label" htmlFor={`${id}-detail`}>What did you do yourself? <span className="font-normal text-muted">(optional)</span></label>
      {fieldError("detail")}
      <textarea id={`${id}-detail`} name="detail" rows={3} maxLength={DETAIL_MAX} className="field" value={detail} onChange={e => setDetail(e.target.value)} aria-describedby={describe(`${id}-detail-hint`, err("detail"))} aria-invalid={errors.detail ? true : undefined} />
      <p id={`${id}-detail-hint`} className="hint">{DETAIL_HINT}</p>
    </div>}

    <p className="hint">{NOTE(props.spec.countsTowardMatch)}</p>
    <button type="submit" className="btn btn-primary btn-sm min-h-11 w-full sm:w-auto" disabled={pending || choice === null}>{pending ? "Saving…" : props.mode === "new" ? "Save my answer" : "Save changes"}</button>
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export type StructuredQuestion = { kind: "what_did_you_do" | "others_did_it"; partIndex: number; part: string; text: string } | { kind: "mismatch" | "not_read"; text: string };

/** One saved structured answer: the person's own choices, the plain questions still open, and a way to change it. */
export function StructuredAnswerBlock({ clarificationId, requirementText, spec, roles, initial, questions, editable, choiceLabel, partsLabel }: {
  clarificationId: string; requirementText: string; spec: FormSpec; roles: { id: string; label: string }[]; initial: StructuredInitial; questions: StructuredQuestion[]; editable: boolean; choiceLabel: string; partsLabel: string | null;
}) {
  const [editingFor, setEditingFor] = useState<number | "all" | null>(null);
  const [answered, answer, answering] = useActionState(reviewPartQuestion, {} as StructuredState);
  return <div className="space-y-2">
    <p>{choiceLabel}{partsLabel && <span className="text-muted"> · {partsLabel}</span>}</p>
    <p className="text-xs text-muted">{matchEffect(spec.countsTowardMatch)}</p>
    {editable && questions.length > 0 && <ul aria-label={`Questions about your answer on ${requirementText}`} className="space-y-2">
      {questions.map((q, i) => <li key={i} className="space-y-2 rounded-md border p-2 text-sm">
        <p>{q.text}</p>
        {(q.kind === "what_did_you_do" || q.kind === "others_did_it") && <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm min-h-11" onClick={() => setEditingFor(q.partIndex)}>{q.kind === "others_did_it" ? "Yes, I did some myself" : "Add to my description"}</button>
          <form action={answer}>
            <input type="hidden" name="clarificationId" value={clarificationId} />
            <input type="hidden" name="partIndex" value={q.partIndex} />
            <input type="hidden" name="response" value={q.kind === "others_did_it" ? "no" : "leave"} />
            <button type="submit" className="btn btn-secondary btn-sm min-h-11" disabled={answering}>{q.kind === "others_did_it" ? "No, others did it" : "Leave it as it is"}</button>
          </form>
        </div>}
        {q.kind === "mismatch" && <button type="button" className="btn btn-secondary btn-sm min-h-11" onClick={() => setEditingFor("all")}>Change my answer</button>}
      </li>)}
    </ul>}
    {answered.error && <p role="alert">{answered.error}</p>}
    {answered.message && <p role="status">{answered.message}</p>}
    {editable && editingFor === null && <button type="button" className="btn btn-secondary btn-sm min-h-11" onClick={() => setEditingFor("all")}>Change this answer<span className="sr-only"> about {requirementText}</span></button>}
    {editable && editingFor !== null && <StructuredAnswerForm mode="correct" clarificationId={clarificationId} initial={initial} spec={spec} roles={roles} requirementText={requirementText} {...(typeof editingFor === "number" ? { partQuestion: editingFor } : {})} />}
  </div>;
}
