"use client";
import { useActionState, useId, useState } from "react";
import { formatMonthRange } from "@/lib/months";
import { ConfirmButton } from "@/components/confirm-button";
import { saveEducation, removeEducation, type EducationState } from "@/app/dashboard/education-actions";
import type { Education as EducationEntry } from "@/lib/education";

function EducationForm({ entry }: { entry?: EducationEntry }) {
  const prefix = useId();
  const [current, setCurrent] = useState(entry ? entry.endMonth === null : false);
  const [state, action, pending] = useActionState(saveEducation, {} as EducationState);
  return <form action={action} aria-label={entry ? `Edit education at ${entry.institution}` : "Add education"} className="space-y-4">
    <input type="hidden" name="educationId" value={entry?.id ?? ""} />
    <fieldset disabled={pending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${prefix}-title`}>Qualification or program</label>
          <input className="field" id={`${prefix}-title`} name="qualification" required maxLength={100} defaultValue={entry?.qualification ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-institution`}>Institution</label>
          <input className="field" id={`${prefix}-institution`} name="institution" required maxLength={100} defaultValue={entry?.institution ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-field`}>Field of study (optional)</label>
        <input className="field" id={`${prefix}-field`} name="fieldOfStudy" maxLength={100} defaultValue={entry?.fieldOfStudy ?? ""} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label" htmlFor={`${prefix}-start`}>Start month</label>
          <input className="field" id={`${prefix}-start`} name="startMonth" type="month" required defaultValue={entry?.startMonth ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-end`}>End month</label>
          <input className="field" id={`${prefix}-end`} name="endMonth" type="month" required={!current} disabled={current} defaultValue={entry?.endMonth ?? ""} />
        </div>
        <label className="check pb-2.5"><input name="current" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} /> Currently studying</label>
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-description`}>Details (optional)</label>
        <textarea className="field" id={`${prefix}-description`} name="description" rows={4} maxLength={5000} defaultValue={entry?.description ?? ""} />
      </div>
      <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save education"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

function EducationRow({ entry }: { entry: EducationEntry }) {
  const [state, action, pending] = useActionState(removeEducation, {} as EducationState);
  return <li className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-semibold">{entry.qualification} at {entry.institution}</h3>
        {entry.fieldOfStudy && <p className="text-sm">{entry.fieldOfStudy}</p>}
        <p className="text-sm text-muted">{formatMonthRange(entry.startMonth, entry.endMonth)}</p>
      </div>
      <form action={action}>
        <input type="hidden" name="educationId" value={entry.id} />
        <ConfirmButton label="Remove education" ariaLabel={`Remove ${entry.qualification} at ${entry.institution}`} confirmLabel="remove" pending={pending} pendingLabel="Removing…" />
      </form>
    </div>
    {entry.description && <p className="whitespace-pre-wrap text-sm">{entry.description}</p>}
    <details className="disclosure"><summary className="text-sm text-accent-text">Edit education</summary><EducationForm key={JSON.stringify(entry)} entry={entry} /></details>
    {state.error && <p role="alert">{state.error}</p>}
  </li>;
}

export function Education({ entries }: { entries: EducationEntry[] }) {
  return <section aria-labelledby="education-heading" className="space-y-5">
    <div className="space-y-1">
      <h2 id="education-heading" className="text-lg font-semibold">Education</h2>
      <p className="text-sm text-muted">Add education or training. Name the qualification or program; use Details to clarify completion or award status.</p>
    </div>
    {entries.length ? <ul className="space-y-3">{entries.map(entry => <EducationRow key={entry.id} entry={entry} />)}</ul> : <p className="rounded-lg border border-dashed bg-surface-muted p-4 text-sm text-muted">No education added yet.</p>}
    <details className="disclosure disclosure-panel"><summary>Add education</summary>
    <EducationForm /></details>
  </section>;
}
