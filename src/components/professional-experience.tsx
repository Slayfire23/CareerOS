"use client";
import { useActionState, useId, useState } from "react";
import { formatMonthRange } from "@/lib/months";
import { ConfirmButton } from "@/components/confirm-button";
import { saveExperience, removeExperience, type ExperienceState } from "@/app/dashboard/experience-actions";
import type { Experience } from "@/lib/professional-experience";

function ExperienceForm({ entry }: { entry?: Experience }) {
  const prefix = useId();
  const [current, setCurrent] = useState(entry ? entry.endMonth === null : false);
  const [state, action, pending] = useActionState(saveExperience, {} as ExperienceState);
  return <form action={action} aria-label={entry ? `Edit experience at ${entry.company}` : "Add professional experience"} className="space-y-4">
    <input type="hidden" name="experienceId" value={entry?.id ?? ""} />
    <fieldset disabled={pending} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${prefix}-title`}>Job title</label>
          <input className="field" id={`${prefix}-title`} name="jobTitle" required maxLength={100} defaultValue={entry?.jobTitle ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${prefix}-company`}>Company</label>
          <input className="field" id={`${prefix}-company`} name="company" required maxLength={100} defaultValue={entry?.company ?? ""} />
        </div>
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
        <label className="check pb-2.5"><input name="current" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} /> Currently working here</label>
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-description`}>Responsibilities and accomplishments (optional)</label>
        <textarea className="field" id={`${prefix}-description`} name="description" rows={4} maxLength={5000} defaultValue={entry?.description ?? ""} />
      </div>
      <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save experience"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

function ExperienceRow({ entry }: { entry: Experience }) {
  const [state, action, pending] = useActionState(removeExperience, {} as ExperienceState);
  return <li className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-semibold">{entry.jobTitle} at {entry.company}</h3>
        <p className="text-sm text-muted">{formatMonthRange(entry.startMonth, entry.endMonth)}</p>
      </div>
      <form action={action}>
        <input type="hidden" name="experienceId" value={entry.id} />
        <ConfirmButton label="Remove experience" ariaLabel={`Remove ${entry.jobTitle} at ${entry.company}`} confirmLabel="remove" pending={pending} pendingLabel="Removing…" />
      </form>
    </div>
    {entry.description && <p className="whitespace-pre-wrap text-sm">{entry.description}</p>}
    <details className="disclosure"><summary className="text-sm text-accent-text">Edit experience</summary><ExperienceForm key={JSON.stringify(entry)} entry={entry} /></details>
    {state.error && <p role="alert">{state.error}</p>}
  </li>;
}

export function ProfessionalExperience({ entries }: { entries: Experience[] }) {
  return <section aria-labelledby="experience-heading" className="space-y-5">
    <div className="space-y-1">
      <h2 id="experience-heading" className="text-lg font-semibold">Professional experience</h2>
      <p className="text-sm text-muted">Add jobs, internships, or other professional work. Describe your own responsibilities and accomplishments.</p>
    </div>
    {entries.length ? <ul className="space-y-3">{entries.map(entry => <ExperienceRow key={entry.id} entry={entry} />)}</ul> : <p className="rounded-lg border border-dashed bg-surface-muted p-4 text-sm text-muted">No professional experience added yet.</p>}
    <details className="disclosure disclosure-panel"><summary>Add experience</summary>
    <ExperienceForm /></details>
  </section>;
}
