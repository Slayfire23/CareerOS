"use client";
import { useActionState, useId, useState } from "react";
import { saveExperience, removeExperience, type ExperienceState } from "@/app/dashboard/experience-actions";
import type { Experience } from "@/lib/professional-experience";

function ExperienceForm({ entry }: { entry?: Experience }) {
  const prefix = useId();
  const [current, setCurrent] = useState(entry ? entry.endMonth === null : false);
  const [state, action, pending] = useActionState(saveExperience, {} as ExperienceState);
  return <form action={action} aria-label={entry ? `Edit experience at ${entry.company}` : "Add professional experience"} className="space-y-3">
    <input type="hidden" name="experienceId" value={entry?.id ?? ""} />
    <fieldset disabled={pending} className="space-y-3">
      <label className="block" htmlFor={`${prefix}-title`}>Job title</label>
      <input className="w-full rounded border p-3" id={`${prefix}-title`} name="jobTitle" required maxLength={100} defaultValue={entry?.jobTitle ?? ""} />
      <label className="block" htmlFor={`${prefix}-company`}>Company</label>
      <input className="w-full rounded border p-3" id={`${prefix}-company`} name="company" required maxLength={100} defaultValue={entry?.company ?? ""} />
      <label className="block" htmlFor={`${prefix}-start`}>Start month</label>
      <input className="rounded border p-3" id={`${prefix}-start`} name="startMonth" type="month" required defaultValue={entry?.startMonth ?? ""} />
      <label className="block"><input name="current" type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} /> Currently working here</label>
      <label className="block" htmlFor={`${prefix}-end`}>End month</label>
      <input className="rounded border p-3 disabled:opacity-50" id={`${prefix}-end`} name="endMonth" type="month" required={!current} disabled={current} defaultValue={entry?.endMonth ?? ""} />
      <label className="block" htmlFor={`${prefix}-description`}>Responsibilities and accomplishments (optional)</label>
      <textarea className="w-full rounded border p-3" id={`${prefix}-description`} name="description" rows={4} maxLength={5000} defaultValue={entry?.description ?? ""} />
      <button className="rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50" type="submit">{pending ? "Saving…" : "Save experience"}</button>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

function ExperienceRow({ entry }: { entry: Experience }) {
  const [state, action, pending] = useActionState(removeExperience, {} as ExperienceState);
  return <li className="space-y-3 rounded border p-4">
    <h3 className="font-semibold">{entry.jobTitle} at {entry.company}</h3>
    <p>{entry.startMonth} – {entry.endMonth ?? "Present"}</p>
    {entry.description && <p className="whitespace-pre-wrap">{entry.description}</p>}
    <details><summary className="cursor-pointer">Edit experience</summary><ExperienceForm key={JSON.stringify(entry)} entry={entry} /></details>
    <form action={action}>
      <input type="hidden" name="experienceId" value={entry.id} />
      <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={pending} aria-label={`Remove ${entry.jobTitle} at ${entry.company}`}>{pending ? "Removing…" : "Remove experience"}</button>
    </form>
    {state.error && <p role="alert">{state.error}</p>}
  </li>;
}

export function ProfessionalExperience({ entries }: { entries: Experience[] }) {
  return <section aria-labelledby="experience-heading" className="space-y-5">
    <h2 id="experience-heading" className="text-xl font-semibold">Professional experience</h2>
    <p>Add jobs, internships, or other professional work. Describe your own responsibilities and accomplishments.</p>
    {entries.length ? <ul className="space-y-4">{entries.map(entry => <ExperienceRow key={entry.id} entry={entry} />)}</ul> : <p>No professional experience added yet.</p>}
    <h3 className="font-semibold">Add experience</h3>
    <ExperienceForm />
  </section>;
}
