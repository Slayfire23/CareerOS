"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import { requirementsHref } from "@/lib/sections";
import { saveJob, removeJob, type JobState } from "@/app/jobs/actions";
import type { SavedJobEntry } from "@/lib/saved-jobs";
import type { RequirementReviewStatus } from "@/lib/overview";

export type SavedJobListItem = SavedJobEntry & { createdAt: Date; reviewStatus: RequirementReviewStatus };

const status: Record<RequirementReviewStatus, { label: string; className: string }> = {
 reviewed: { label: "Requirements reviewed", className: "bg-accent-soft text-accent-text" },
 "not-reviewed": { label: "Not reviewed", className: "bg-surface-muted text-muted" },
 "out-of-date": { label: "Needs re-review", className: "border text-foreground" },
};
const savedFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function JobForm({ job }: { job?: SavedJobEntry }) {
 const prefix = useId();
 const [state, action, pending] = useActionState(saveJob, {} as JobState);
 return <form aria-label={job ? `Edit job at ${job.company}` : "Add job"} action={action} className="space-y-4">
  <input type="hidden" name="jobId" value={job?.id ?? ""} />
  <fieldset disabled={pending} className="space-y-4">
   <div className={job ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
    <div>
     <label className="label" htmlFor={`${prefix}-title`}>Job title</label>
     <input className="field" id={`${prefix}-title`} name="title" required maxLength={200} defaultValue={job?.title ?? ""} />
    </div>
    <div>
     <label className="label" htmlFor={`${prefix}-company`}>Company</label>
     <input className="field" id={`${prefix}-company`} name="company" required maxLength={200} defaultValue={job?.company ?? ""} />
    </div>
   </div>
   <div>
    <label className="label" htmlFor={`${prefix}-url`}>Posting link (optional)</label>
    <input className="field" id={`${prefix}-url`} name="postingUrl" type="url" maxLength={2000} placeholder="https://" defaultValue={job?.postingUrl ?? ""} />
   </div>
   <div>
    <label className="label" htmlFor={`${prefix}-description`}>Job description</label>
    <textarea className="field" id={`${prefix}-description`} name="description" required rows={job ? 10 : 8} maxLength={30000} aria-describedby={`${prefix}-description-help`} defaultValue={job?.description ?? ""} />
    <p id={`${prefix}-description-help`} className="hint">Paste the posting text. Links are saved as references; their contents are not fetched.</p>
   </div>
   <button className="btn btn-primary" type="submit">{pending ? "Saving…" : "Save job"}</button>
  </fieldset>
  {state.error && <p role="alert">{state.error}</p>}
  {state.message && <p role="status">{state.message}</p>}
 </form>;
}

function JobRow({ job }: { job: SavedJobListItem }) {
 const [state, action, pending] = useActionState(removeJob, {} as JobState);
 return <li className="space-y-3 rounded-xl border bg-surface p-4 sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div className="min-w-0">
    <h3 className="font-semibold">{job.title} at {job.company}</h3>
    <p className="text-sm text-muted">Saved {savedFormat.format(job.createdAt)}</p>
   </div>
   <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status[job.reviewStatus].className}`}>{status[job.reviewStatus].label}</span>
  </div>
  <div className="flex flex-wrap items-center gap-2">
   <Link className="btn btn-primary btn-sm" href={requirementsHref(job.id)}>Review requirements</Link>
   {job.postingUrl && <a href={job.postingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">Open posting<span className="sr-only"> (opens in a new tab)</span></a>}
   <form action={action} className="ml-auto"><input type="hidden" name="jobId" value={job.id} /><button className="btn btn-danger btn-sm" disabled={pending} aria-label={`Remove ${job.title} at ${job.company}`}>{pending ? "Removing…" : "Remove job"}</button></form>
  </div>
  <details className="disclosure border-t pt-3"><summary className="text-sm">View description</summary><p className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 text-sm">{job.description}</p></details>
  <details className="disclosure border-t pt-3"><summary className="text-sm">Edit job</summary><JobForm key={JSON.stringify(job)} job={job} /></details>
  {state.error && <p role="alert">{state.error}</p>}
 </li>;
}

export function SavedJobs({ jobs }: { jobs: SavedJobListItem[] }) {
 return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
  <section aria-labelledby="saved-jobs-heading" className="min-w-0 space-y-4">
   <h2 id="saved-jobs-heading" className="text-lg font-semibold">Your saved jobs ({jobs.length})</h2>
   {jobs.length ? <ul className="space-y-3">{jobs.map(job => <JobRow key={job.id} job={job} />)}</ul> : <div className="rounded-xl border border-dashed bg-surface-muted p-6 text-center">
    <p className="font-medium">No jobs saved yet.</p>
    <p className="mt-1 text-sm text-muted">Paste a posting in <strong>Add a job</strong>, then review its requirements.</p>
   </div>}
  </section>
  <section aria-labelledby="add-job-heading" className="space-y-4 rounded-xl border bg-surface p-5 lg:sticky lg:top-6">
   <div className="space-y-1">
    <h2 id="add-job-heading" className="text-lg font-semibold">Add a job</h2>
    <p className="text-sm text-muted">Saving a job does not apply or analyze your fit.</p>
   </div>
   <JobForm />
  </section>
 </div>;
}
