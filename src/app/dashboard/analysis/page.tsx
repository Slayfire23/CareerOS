import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSavedJobsOverview, type RecentJob } from "@/lib/overview";
import { requirementsHref, SECTIONS } from "@/lib/sections";
import { Card, EmptyState, LoadingBlock, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Job analysis" };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const groups: { status: RecentJob["reviewStatus"]; title: string; description: string; action: string }[] = [
  { status: "out-of-date", title: "Needs re-review", description: "The job description changed after you reviewed it.", action: "Review again" },
  { status: "not-reviewed", title: "Not reviewed yet", description: "Pick out requirements from the posting text.", action: "Review requirements" },
  { status: "reviewed", title: "Reviewed", description: "Requirements you confirmed against the current description.", action: "Open analysis" },
];

function JobRow({ job, action }: { job: RecentJob; action: string }) {
  const { Required, Preferred, Unspecified } = job.priorityCounts;
  const breakdown = [Required && `${Required} required`, Preferred && `${Preferred} preferred`, Unspecified && `${Unspecified} unspecified`].filter(Boolean).join(" · ");
  return <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold">{job.title} <span className="font-normal text-muted">at {job.company}</span></p>
      <p className="text-sm text-muted">Saved {dateFormat.format(job.createdAt)}{job.reviewStatus !== "not-reviewed" && ` · ${breakdown || "No requirements kept"}`}</p>
    </div>
    <Link className="shrink-0 text-sm font-medium text-accent-text hover:underline" href={requirementsHref(job.id)}>
      {action}<span className="sr-only"> for {job.title} at {job.company}</span>
    </Link>
  </li>;
}

async function AnalysisContent() {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { total, jobs } = await getSavedJobsOverview(user.id);
  if (!total) return <EmptyState title="No saved jobs to analyze" action={<Link className="text-sm font-medium text-accent-text hover:underline" href={SECTIONS.jobs.href}>Save a job →</Link>}>
    Save a job posting first, then review its requirements here.
  </EmptyState>;
  return <div className="space-y-6">
    {groups.map(group => {
      const items = jobs.filter(job => job.reviewStatus === group.status);
      if (!items.length) return null;
      return <Card key={group.status} className="space-y-1">
        <h2 className="text-lg font-semibold">{group.title} <span className="text-sm font-normal text-muted">({items.length})</span></h2>
        <p className="text-sm text-muted">{group.description}</p>
        <ul className="divide-y divide-line">{items.map(job => <JobRow key={job.id} job={job} action={group.action} />)}</ul>
      </Card>;
    })}
  </div>;
}

export default function AnalysisPage() {
  return <div className="space-y-8">
    <PageHeader title="Job analysis" description="Review each saved job's requirements against its posting. This uses simple text rules and your own confirmation. It does not score your fit." />
    <Suspense fallback={<LoadingBlock label="Loading job analysis…" />}><AnalysisContent /></Suspense>
  </div>;
}
