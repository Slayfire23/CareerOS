"use client";
import { useActionState, useId, useState } from "react";
import { saveEducation, removeEducation, type EducationState } from "@/app/dashboard/education-actions";
import type { Education as EducationEntry } from "@/lib/education";

function EducationForm({ entry }: { entry?: EducationEntry }) {
  const prefix = useId();
  const [current, setCurrent] = useState(entry ? entry.endMonth === null : false);
  const [state, action, pending] = useActionState(saveEducation, {} as EducationState);
  return <form action={action} aria-label={entry ? `Edit education at ${entry.institution}` : "Add education"} className="space-y-3">
    <input type="hidden" name="educationId" value={entry?.id ?? ""} />
    <fieldset disabled={pending} className="space-y-3">
      <label className="block" htmlFor={`${prefix}-title`}>Qualification or program</label>
      <input className="w-full rounded border p-3" id={`${prefix}-title`} name="qualification" required maxLength={100} defaultValue={entry?.qualification ?? ""} />
      <label className="block" htmlFor={`${prefix}-institution`}>Institution</label>
      <input className="w-full rounded border p-3" id={`${prefix}-institution`} name="institution" required maxLength={100} defaultValue={entry?.institution ?? ""} />
      <label className="block" htmlFor={`${prefix}-field`}>Field of study (optional)</label>
      <input className="w-full rounded border p-3" id={`${prefix}-field`} name="fieldOfStudy" maxLength={100} defaultValue={entry?.fieldOfStudy ?? ""} />
      <label className="block" htmlFor={`${prefix}-start`}>Start month</label>
      <input className="rounded border p-3" id={`${prefix}-start`} name="startMonth" type="month" required defaultValue={entry?.startMonth ?? ""} />
      <label className="block"><input name="current" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} /> Currently studying</label>
      <label className="block" htmlFor={`${prefix}-end`}>End month</label>
      <input className="rounded border p-3 disabled:opacity-50" id={`${prefix}-end`} name="endMonth" type="month" required={!current} disabled={current} defaultValue={entry?.endMonth ?? ""} />
      <label className="block" htmlFor={`${prefix}-description`}>Details (optional)</label>
      <textarea className="w-full rounded border p-3" id={`${prefix}-description`} name="description" rows={4} maxLength={5000} defaultValue={entry?.description ?? ""} />
      <button className="rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50" type="submit">{pending ? "Saving…" : "Save education"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

function EducationRow({ entry }: { entry: EducationEntry }) {
  const [state, action, pending] = useActionState(removeEducation, {} as EducationState);
  return <li className="space-y-3 rounded border p-4">
    <h3 className="font-semibold">{entry.qualification} at {entry.institution}</h3>
    {entry.fieldOfStudy && <p>{entry.fieldOfStudy}</p>}
    <p>{entry.startMonth} – {entry.endMonth ?? "Present"}</p>
    {entry.description && <p className="whitespace-pre-wrap">{entry.description}</p>}
    <details><summary className="cursor-pointer">Edit education</summary><EducationForm key={JSON.stringify(entry)} entry={entry} /></details>
    <form action={action}>
      <input type="hidden" name="educationId" value={entry.id} />
      <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={pending} aria-label={`Remove ${entry.qualification} at ${entry.institution}`}>{pending ? "Removing…" : "Remove education"}</button>
    </form>
    {state.error && <p role="alert">{state.error}</p>}
  </li>;
}

export function Education({ entries }: { entries: EducationEntry[] }) {
  return <section aria-labelledby="education-heading" className="space-y-5">
    <h2 id="education-heading" className="text-xl font-semibold">Education</h2>
    <p>Add education or training. Name the qualification or program; use Details to clarify completion or award status.</p>
    {entries.length ? <ul className="space-y-4">{entries.map(entry => <EducationRow key={entry.id} entry={entry} />)}</ul> : <p>No education added yet.</p>}
    <details className="rounded border p-4"><summary className="cursor-pointer font-semibold">Add education</summary>
    <div className="mt-4"><EducationForm /></div></details>
  </section>;
}
