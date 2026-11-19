import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSavedJobsOverview, type RecentJob } from "@/lib/overview";
import { matchHref, requirementsHref, SECTIONS } from "@/lib/sections";
import { ButtonLink, LoadingBlock, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Job analysis" };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const groups: { status: RecentJob["reviewStatus"]; title: string; description: string; action: string; marker: string }[] = [
  { status: "out-of-date", title: "Needs re-review", description: "The job description changed after you reviewed it. Check your saved requirements against the new text.", action: "Review again", marker: "border-l-foreground/40" },
  { status: "not-reviewed", title: "Not reviewed yet", description: "Pick out requirements from the posting text and confirm them.", action: "Review requirements", marker: "border-l-line" },
  { status: "reviewed", title: "Reviewed", description: "Requirements you confirmed against the current description. Run a requirement analysis to compare them with your profile.", action: "Open review", marker: "border-l-accent" },
];

function Breakdown({ job }: { job: RecentJob }) {
  if (job.reviewStatus === "not-reviewed") return null;
  const { Required, Preferred, Unspecified } = job.priorityCounts;
  if (!job.requirementCount) return <p className="text-sm text-muted">No requirements kept</p>;
  return <ul aria-label="Kept requirements by priority" className="flex flex-wrap gap-1.5">
    {([["required", Required], ["preferred", Preferred], ["unspecified", Unspecified]] as const).filter(([, count]) => count > 0).map(([label, count]) =>
      <li key={label} className={`rounded-full px-2 py-0.5 text-xs font-medium ${label === "required" ? "bg-accent-soft text-accent-text" : "bg-surface-muted text-muted"}`}>{count} {label}</li>)}
  </ul>;
}

function JobRow({ job, action }: { job: RecentJob; action: string }) {
  return <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
    <div className="min-w-0 flex-1 space-y-1">
      <p className="font-semibold">{job.title} <span className="font-normal text-muted">at {job.company}</span></p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Saved {dateFormat.format(job.createdAt)}</span>
        <Breakdown job={job} />
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
      {job.reviewStatus === "reviewed" && <Link className="btn btn-primary btn-sm" href={matchHref(job.id)}>
        Requirement analysis<span className="sr-only"> for {job.title} at {job.company}</span>
      </Link>}
      <Link className="btn btn-secondary btn-sm" href={requirementsHref(job.id)}>
        {action}<span className="sr-only"> for {job.title} at {job.company}</span>
      </Link>
    </div>
  </li>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="rounded-xl border bg-surface px-4 py-3">
    <p className="text-2xl font-bold tabular-nums">{value}</p>
    <p className="text-sm text-muted">{label}</p>
  </div>;
}

async function AnalysisContent() {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { total, reviewed, notReviewed, outOfDate, jobs } = await getSavedJobsOverview(user.id);
  if (!total) return <div className="rounded-xl border border-dashed bg-surface-muted p-8 text-center">
    <p className="font-medium">No saved jobs to analyze</p>
    <p className="mx-auto mt-1 max-w-md text-sm text-muted">Save a job posting first. You can then pick out its requirements here, each tied to the line of the posting it came from.</p>
    <ButtonLink href={SECTIONS.jobs.href} variant="primary" className="mt-4">Save a job</ButtonLink>
  </div>;
  return <div className="space-y-6">
    <div className="grid grid-cols-3 gap-3">
      <Stat value={total} label="Saved jobs" />
      <Stat value={reviewed} label="Reviewed" />
      <Stat value={notReviewed + outOfDate} label="Need review" />
    </div>
    {groups.map(group => {
      const items = jobs.filter(job => job.reviewStatus === group.status);
      if (!items.length) return null;
      return <section key={group.status} aria-labelledby={`group-${group.status}`} className={`rounded-xl border border-l-4 bg-surface p-5 shadow-sm ${group.marker}`}>
        <h2 id={`group-${group.status}`} className="text-lg font-semibold">{group.title} <span className="text-sm font-normal text-muted">({items.length})</span></h2>
        <p className="text-sm text-muted">{group.description}</p>
        <ul className="mt-2 divide-y">{items.map(job => <JobRow key={job.id} job={job} action={group.action} />)}</ul>
      </section>;
    })}
  </div>;
}

export default function AnalysisPage() {
  return <div className="space-y-8">
    <PageHeader title="Job analysis" description="Review each saved job's requirements against its posting. Suggestions use simple text rules and your own confirmation. Nothing here scores your fit." actions={<ButtonLink href={SECTIONS.jobs.href}>Manage saved jobs</ButtonLink>} />
    <Suspense fallback={<LoadingBlock variant="list" label="Loading job analysis…" />}><AnalysisContent /></Suspense>
  </div>;
}
