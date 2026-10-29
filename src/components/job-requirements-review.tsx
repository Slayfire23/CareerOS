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
 const selectedCount = rows.filter(row => row.selected).length;
 return <div className="space-y-6">
  <p className={stale ? "rounded-lg border border-l-4 border-l-foreground/40 bg-surface-muted p-3 text-sm" : "text-sm text-muted"}>{reviewed ? stale ? "The job description changed. The earlier review is out of date. Check every requirement against the current description and select those to keep." : "These are your saved, reviewed requirements." : "These suggestions use simple text rules and may miss or misclassify requirements. Nothing is saved until you select and confirm it."}</p>
  <details className="disclosure rounded-lg border p-3"><summary className="text-sm">Original job description</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 font-sans text-sm">{description}</pre></details>
  <form action={action} aria-label="Review job requirements" className="space-y-4">
   <input type="hidden" name="jobId" value={id} />
   <input type="hidden" name="baseDescription" value={description} />
   <input type="hidden" name="reviewVersion" value={version} />
   <input type="hidden" name="requirements" value={JSON.stringify(rows.filter(row => row.selected).map(({text, category, priority, source}) => ({text, category, priority, source})))} />
   <fieldset disabled={pending || !!state.message} className="space-y-4">
    {rows.length === 0 && <p className="rounded-lg border border-dashed bg-surface-muted p-4 text-sm text-muted">No requirements listed. Add one manually using the description above.</p>}
    <ol className="space-y-3">
    {rows.map((row, index) => <li key={row.key} className={`space-y-3 rounded-xl border p-4 transition-colors ${row.selected ? "border-accent bg-accent-soft/40" : "bg-surface"}`}>
     <div className="flex items-center justify-between gap-3">
      <label className="check font-medium"><input type="checkbox" checked={row.selected} onChange={event => update(row.key, {selected: event.target.checked})} /> Include requirement {index + 1}</label>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Remove requirement {index + 1}</button>
     </div>
     <div>
      <label className="label" htmlFor={`${prefix}-${row.key}-text`}>Requirement {index + 1}</label>
      <textarea id={`${prefix}-${row.key}-text`} className="field" rows={2} maxLength={1000} required={row.selected} value={row.text} onChange={event => update(row.key, {text: event.target.value})} />
     </div>
     <div className="grid gap-3 sm:grid-cols-2">
      <div>
       <label className="label" htmlFor={`${prefix}-${row.key}-category`}>Category {index + 1}</label>
       <select id={`${prefix}-${row.key}-category`} className="field" value={row.category} onChange={event => update(row.key, {category: event.target.value as Requirement["category"]})}>{categories.map(value => <option key={value}>{value}</option>)}</select>
      </div>
      <div>
       <label className="label" htmlFor={`${prefix}-${row.key}-priority`}>Priority {index + 1}</label>
       <select id={`${prefix}-${row.key}-priority`} className="field" value={row.priority} onChange={event => update(row.key, {priority: event.target.value as Requirement["priority"]})}>{priorities.map(value => <option key={value}>{value}</option>)}</select>
      </div>
     </div>
     {row.source ? <div className="space-y-1"><p className="text-xs font-medium text-muted">Source excerpt</p><blockquote className="whitespace-pre-wrap break-words border-l-2 border-accent/50 pl-3 text-sm italic text-muted">{row.source}</blockquote>{!description.includes(row.source) && <p className="alert">Excerpt no longer present. Remove this row and add a corrected requirement.</p>}</div> : <p className="hint">Manually added; check this against the description.</p>}
    </li>)}
    </ol>
    <button type="button" className="btn btn-secondary" disabled={rows.length >= 50} onClick={() => {setRows(current => [...current, {key: nextKey, text: "", category: "Other", priority: "Unspecified", source: "", selected: true}]); setNextKey(nextKey + 1);}}><span aria-hidden="true">+</span> Add requirement</button>
    <div className="space-y-3 rounded-xl border bg-surface-muted p-4">
     <p className="text-sm text-muted">Save replaces the previous list with only the selected requirements. Saving with none selected clears the list. Maximum 50 requirements. This does not assess your qualifications.</p>
     <label className="check"><input type="checkbox" name="confirmed" required /> I reviewed the selected requirements against the job description.</label>
     <div className="flex flex-wrap items-center gap-3">
      <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save reviewed requirements"}</button>
      <span className="text-sm text-muted" aria-live="polite">{selectedCount} of {rows.length} selected</span>
     </div>
    </div>
   </fieldset>
   {state.error && <p role="alert">{state.error}</p>}
   {state.message && <p role="status">{state.message} <a href={requirementsHref(id)} className="underline">Reopen review</a></p>}
  </form>
 </div>;
}
