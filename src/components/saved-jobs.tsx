"use client";
import Link from "next/link";
import { requirementsHref } from "@/lib/sections";
import { useActionState, useId } from "react";
import { saveJob, removeJob, type JobState } from "@/app/jobs/actions";
import type { SavedJobEntry } from "@/lib/saved-jobs";
function JobForm({ job }: { job?: SavedJobEntry }) {
 const prefix = useId();
 const [state, action, pending] = useActionState(saveJob, {} as JobState);
 return <form aria-label={job ? `Edit job at ${job.company}` : "Add job"} action={action} className="space-y-3">
  <input type="hidden" name="jobId" value={job?.id ?? ""} />
  <fieldset disabled={pending} className="space-y-3">
   <label className="block" htmlFor={`${prefix}-title`}>Job title</label>
   <input className="w-full rounded border p-3" id={`${prefix}-title`} name="title" required maxLength={200} defaultValue={job?.title ?? ""} />
   <label className="block" htmlFor={`${prefix}-company`}>Company</label>
   <input className="w-full rounded border p-3" id={`${prefix}-company`} name="company" required maxLength={200} defaultValue={job?.company ?? ""} />
   <label className="block" htmlFor={`${prefix}-url`}>Posting link (optional)</label>
   <input className="w-full rounded border p-3" id={`${prefix}-url`} name="postingUrl" type="url" maxLength={2000} defaultValue={job?.postingUrl ?? ""} />
   <label className="block" htmlFor={`${prefix}-description`}>Job description</label>
   <textarea className="w-full rounded border p-3" id={`${prefix}-description`} name="description" required rows={10} maxLength={30000} defaultValue={job?.description ?? ""} />
   <p className="text-sm">Paste the posting text. Links are saved as references; their contents are not fetched.</p>
   <button className="rounded bg-blue-700 px-5 py-3 text-white" type="submit">{pending ? "Saving…" : "Save job"}</button>
  </fieldset>
  {state.error && <p role="alert">{state.error}</p>}
  {state.message && <p role="status">{state.message}</p>}
 </form>;
}
function JobRow({ job }: { job: SavedJobEntry }) {
 const [state, action, pending] = useActionState(removeJob, {} as JobState);
 return <li className="space-y-3 rounded border p-4">
  <h3 className="font-semibold">{job.title} at {job.company}</h3>
  <Link className="block underline" href={requirementsHref(job.id)}>Review requirements</Link>
  {job.postingUrl && <a href={job.postingUrl} target="_blank" rel="noopener noreferrer" className="underline">Open posting</a>}
  <details><summary className="cursor-pointer">View description</summary><p className="whitespace-pre-wrap break-words">{job.description}</p></details>
  <details><summary className="cursor-pointer">Edit job</summary><JobForm key={JSON.stringify(job)} job={job} /></details>
  <form action={action}><input type="hidden" name="jobId" value={job.id} /><button className="rounded border px-3 py-2" disabled={pending} aria-label={`Remove ${job.title} at ${job.company}`}>{pending ? "Removing…" : "Remove job"}</button></form>
  {state.error && <p role="alert">{state.error}</p>}
 </li>;
}
export function SavedJobs({ jobs }: { jobs: SavedJobEntry[] }) {
 return <div className="space-y-8">
  <section aria-labelledby="add-job-heading" className="space-y-4"><h2 id="add-job-heading" className="text-xl font-semibold">Add a job</h2><JobForm /></section>
  <section aria-labelledby="saved-jobs-heading" className="space-y-4"><h2 id="saved-jobs-heading" className="text-xl font-semibold">Your saved jobs ({jobs.length})</h2>
  {jobs.length ? <ul className="space-y-4">{jobs.map(job => <JobRow key={job.id} job={job} />)}</ul> : <p>No jobs saved yet.</p>}</section>
 </div>;
}
