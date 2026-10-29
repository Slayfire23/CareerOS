"use client";
import { useActionState, useId, useState } from "react";
import { requirementsHref } from "@/lib/sections";
import { categories, priorities, type Requirement } from "@/lib/job-requirements";
import { saveRequirements, type RequirementState } from "@/app/jobs/requirements-actions";

export function JobRequirementsReview({id, description, version, reviewed, stale, initial}: {id: string; description: string; version: number; reviewed: boolean; stale: boolean; initial: Requirement[]}) {
 const prefix = useId();
 const [rows, setRows] = useState(initial.map((row, index) => ({...row, key: index, selected: reviewed && !stale})));
 const [nextKey, setNextKey] = useState(initial.length);
 const [state, action, pending] = useActionState(saveRequirements, {} as RequirementState);
 const update = (key: number, patch: Partial<Requirement> & {selected?: boolean}) => setRows(current => current.map(row => row.key === key ? {...row, ...patch} : row));
 return <div className="space-y-6">
  <p>{reviewed ? stale ? "The job description changed. The earlier review is out of date. Check every requirement against the current description and select those to keep." : "These are your saved, reviewed requirements." : "These suggestions use simple text rules and may miss or misclassify requirements. Nothing is saved until you select and confirm it."}</p>
  <details><summary className="cursor-pointer font-semibold">Original job description</summary><pre className="whitespace-pre-wrap break-words font-sans">{description}</pre></details>
  <form action={action} aria-label="Review job requirements" className="space-y-4">
   <input type="hidden" name="jobId" value={id} />
   <input type="hidden" name="baseDescription" value={description} />
   <input type="hidden" name="reviewVersion" value={version} />
   <input type="hidden" name="requirements" value={JSON.stringify(rows.filter(row => row.selected).map(({text, category, priority, source}) => ({text, category, priority, source})))} />
   <fieldset disabled={pending || !!state.message} className="space-y-4">
    {rows.length === 0 && <p>No requirements listed. Add one manually using the description above.</p>}
    {rows.map((row, index) => <div key={row.key} className="space-y-3 rounded border p-4">
     <label className="block"><input type="checkbox" checked={row.selected} onChange={event => update(row.key, {selected: event.target.checked})} /> Include requirement {index + 1}</label>
     <label className="block" htmlFor={`${prefix}-${row.key}-text`}>Requirement {index + 1}</label>
     <textarea id={`${prefix}-${row.key}-text`} className="w-full rounded border p-3" rows={3} maxLength={1000} required={row.selected} value={row.text} onChange={event => update(row.key, {text: event.target.value})} />
     <label className="block" htmlFor={`${prefix}-${row.key}-category`}>Category {index + 1}</label>
     <select id={`${prefix}-${row.key}-category`} className="rounded border p-3" value={row.category} onChange={event => update(row.key, {category: event.target.value as Requirement["category"]})}>{categories.map(value => <option key={value}>{value}</option>)}</select>
     <label className="block" htmlFor={`${prefix}-${row.key}-priority`}>Priority {index + 1}</label>
     <select id={`${prefix}-${row.key}-priority`} className="rounded border p-3" value={row.priority} onChange={event => update(row.key, {priority: event.target.value as Requirement["priority"]})}>{priorities.map(value => <option key={value}>{value}</option>)}</select>
     {row.source ? <div><p className="font-semibold">Source excerpt</p><blockquote className="whitespace-pre-wrap break-words">{row.source}</blockquote>{!description.includes(row.source) && <p>Excerpt no longer present. Remove this row and add a corrected requirement.</p>}</div> : <p>Manually added; check this against the description.</p>}
     <button type="button" className="rounded border px-3 py-2" onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove requirement {index + 1}</button>
    </div>)}
    <button type="button" className="rounded border px-3 py-2" disabled={rows.length >= 50} onClick={() => {setRows(current => [...current, {key: nextKey, text: "", category: "Other", priority: "Unspecified", source: "", selected: true}]); setNextKey(nextKey + 1);}}>Add requirement</button>
    <p>Save replaces the previous list with only the selected requirements. Saving with none selected clears the list. Maximum 50 requirements. This does not assess your qualifications.</p>
    <label className="block"><input type="checkbox" name="confirmed" required /> I reviewed the selected requirements against the job description.</label>
    <button className="rounded bg-blue-700 px-5 py-3 text-white" type="submit">{pending ? "Saving…" : "Save reviewed requirements"}</button>
   </fieldset>
   {state.error && <p role="alert">{state.error}</p>}
   {state.message && <p role="status">{state.message} <a href={requirementsHref(id)} className="underline">Reopen review</a></p>}
  </form>
 </div>;
}
