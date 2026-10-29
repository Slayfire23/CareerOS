import Link from "next/link";
import type { ReactNode } from "react";
import type { getCurrentProfile } from "@/lib/profile";
import type { getResumes } from "@/lib/resumes";
import type { getSavedJobsOverview, RecentJob } from "@/lib/overview";
import { SALARY_PERIODS } from "@/lib/salary-expectations";
import { requirementsHref, SECTIONS } from "@/lib/sections";
import { Card, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";

// Summaries only: every value shown here is something the user saved. No forms.
type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;
type Resumes = Awaited<ReturnType<typeof getResumes>>;
type Jobs = Awaited<ReturnType<typeof getSavedJobsOverview>>;

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function salarySummary({ salaryMinCents: min, salaryMaxCents: max, salaryCurrency: currency, salaryPeriod: period }: Profile) {
  if (min === null || !currency) return null;
  const range = max !== null && max !== min ? `${formatMoney(min, currency)}–${formatMoney(max, currency)}` : formatMoney(min, currency);
  const label = SALARY_PERIODS.find(item => item.value === period)?.label.toLowerCase();
  return label ? `${range} ${label}` : range;
}

function QuickActions() {
  const actions = [
    { href: SECTIONS.jobs.href, label: "Save a job", hint: "Paste a posting", icon: "briefcase" as const, primary: true },
    { href: SECTIONS.resumes.href, label: "Upload resume", hint: "PDF, up to 2 MiB", icon: "upload" as const },
    { href: SECTIONS.skills.href, label: "Add a skill", hint: "With proficiency", icon: "plus" as const },
    { href: SECTIONS.experience.href, label: "Add work history", hint: "Roles and dates", icon: "list" as const },
  ];
  return <nav aria-label="Quick actions" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
    {actions.map(action => <Link key={action.label} href={action.href} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${action.primary ? "border-accent bg-accent text-white hover:bg-accent-strong" : "border-line bg-surface hover:border-accent"}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${action.primary ? "bg-white/15" : "bg-accent-soft text-accent-text"}`}><Icon name={action.icon} /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{action.label}</span>
        <span className={`hidden truncate text-xs sm:block ${action.primary ? "text-white/80" : "text-muted"}`}>{action.hint}</span>
      </span>
    </Link>)}
  </nav>;
}

const status: Record<RecentJob["reviewStatus"], { label: string; className: string; action: string }> = {
  reviewed: { label: "Reviewed", className: "bg-accent-soft text-accent-text", action: "Open analysis" },
  "not-reviewed": { label: "Not reviewed", className: "bg-surface-muted text-muted", action: "Review requirements" },
  "out-of-date": { label: "Needs re-review", className: "border border-line text-foreground", action: "Review again" },
};

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="rounded-lg bg-surface-muted px-3 py-2">
    <p className="text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    <p className="text-xs text-muted">{label}</p>
  </div>;
}

function SavedJobsSummary({ total, reviewed, notReviewed, outOfDate, jobs }: Jobs) {
  return <Card className="space-y-4 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Saved jobs</h2>
      <Link className="text-sm font-medium text-accent-text hover:underline" href={SECTIONS.jobs.href}>View saved jobs</Link>
    </div>
    {total > 0 ? <>
      <div className="grid grid-cols-3 gap-2">
        <Stat value={total} label="Saved" />
        <Stat value={reviewed} label="Reviewed" />
        <Stat value={notReviewed + outOfDate} label="Need review" />
      </div>
      <ul className="divide-y divide-line">
        {jobs.map(job => <li key={job.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold sm:truncate sm:text-base" title={job.title}>{job.title}</p>
            <p className="break-words text-xs text-muted sm:truncate sm:text-sm">{job.company} · Saved {dateFormat.format(job.createdAt)}{job.reviewStatus === "reviewed" && ` · ${plural(job.requirementCount, "requirement")}`}</p>
          </div>
          <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline ${status[job.reviewStatus].className}`}>{status[job.reviewStatus].label}</span>
          <Link className="shrink-0 text-sm font-medium text-accent-text hover:underline" href={requirementsHref(job.id)}>
            <span className="sm:hidden">{status[job.reviewStatus].label === "Reviewed" ? "Open" : "Review"}</span>
            <span className="hidden sm:inline">{status[job.reviewStatus].action}</span>
            <span className="sr-only"> for {job.title} at {job.company} ({status[job.reviewStatus].label})</span>
          </Link>
        </li>)}
      </ul>
      {total > jobs.length && <p className="text-xs text-muted">Showing the {jobs.length} most recent of {total}.</p>}
    </> : <EmptyState title="No saved jobs yet" action={<Link href={SECTIONS.jobs.href} className="text-sm font-medium text-accent-text hover:underline">Save your first job →</Link>}>
      Paste a job posting to keep it here and pick out its requirements.
    </EmptyState>}
  </Card>;
}

function Row({ href, label, value, detail, emptyText = "Not added" }: { href: string; label: string; value: ReactNode; detail?: string | null; emptyText?: string }) {
  const empty = value === null;
  return <li>
    <Link href={href} className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted">
      <span className="w-20 shrink-0 text-xs font-medium text-muted sm:w-24">{label}</span>
      <span className="min-w-0 flex-1">
        <span className={`block break-words text-sm md:truncate ${empty ? "text-muted" : "font-semibold"}`} title={typeof value === "string" ? value : undefined}>{empty ? emptyText : value}</span>
        {!empty && detail && <span className="block break-words text-xs text-muted md:truncate" title={detail}>{detail}</span>}
      </span>
      <Icon name="chevron" className="h-4 w-4 shrink-0 text-muted group-hover:text-accent-text" />
    </Link>
  </li>;
}

function ProfileSummary({ profile, resumes }: { profile: Profile; resumes: Resumes }) {
  const salary = salarySummary(profile);
  const latestJob = profile.professionalExperiences[0];
  const latestEducation = profile.educationEntries[0];
  const preferenceCount = profile.targetRoles.length + profile.industries.length + profile.workArrangements.length + profile.employmentTypes.length;
  const location = [...profile.preferredLocations];
  if (profile.maxCommuteMinutes !== null) location.push(`${profile.maxCommuteMinutes} min commute`);
  const checklist = [
    { label: "headline", done: !!profile.headline, href: SECTIONS.profile.href },
    { label: "preferences", done: preferenceCount > 0, href: SECTIONS.preferences.href },
    { label: "location", done: location.length > 0 || profile.relocationWillingness !== null, href: SECTIONS.preferences.href },
    { label: "salary", done: salary !== null, href: SECTIONS.preferences.href },
    { label: "skills", done: profile.technicalSkills.length > 0, href: SECTIONS.skills.href },
    { label: "experience", done: profile.professionalExperiences.length > 0, href: SECTIONS.experience.href },
    { label: "education", done: profile.educationEntries.length > 0, href: SECTIONS.education.href },
    { label: "resume", done: resumes.files.length > 0, href: SECTIONS.resumes.href },
  ];
  const done = checklist.filter(item => item.done).length;
  const missing = checklist.filter(item => !item.done);

  return <Card className="space-y-4 p-4 sm:p-5">
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Your profile</h2>
        <p className="text-sm text-muted"><span className="font-semibold text-foreground">{done} of {checklist.length}</span> sections filled</p>
      </div>
      <div role="progressbar" aria-label="Profile sections filled" aria-valuemin={0} aria-valuemax={checklist.length} aria-valuenow={done} className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(done / checklist.length) * 100}%` }} />
      </div>
      {missing.length > 0 && <ul aria-label="Sections without information" className="flex flex-wrap gap-1.5 pt-1">
        {missing.map(item => <li key={item.label}><Link href={item.href} className="inline-block rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted hover:border-accent hover:text-accent-text">+ Add {item.label}</Link></li>)}
      </ul>}
    </div>
    <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
      <Row href={SECTIONS.profile.href} label="Headline" value={profile.headline} />
      <Row href={SECTIONS.preferences.href} label="Target roles" value={profile.targetRoles.length ? profile.targetRoles.join(", ") : null} detail={profile.workArrangements.length || profile.employmentTypes.length ? `${plural(preferenceCount, "preference")} saved` : null} />
      <Row href={SECTIONS.skills.href} label="Skills" value={profile.technicalSkills.length ? plural(profile.technicalSkills.length, "skill") : null} detail={profile.technicalSkills.slice(0, 4).map(skill => skill.name).join(", ")} />
      <Row href={SECTIONS.experience.href} label="Experience" value={latestJob ? `${latestJob.jobTitle}, ${latestJob.company}` : null} detail={latestJob && `${plural(profile.professionalExperiences.length, "role")} · most recent first`} />
      <Row href={SECTIONS.education.href} label="Education" value={latestEducation ? `${latestEducation.qualification}, ${latestEducation.institution}` : null} detail={latestEducation && profile.educationEntries.length > 1 ? plural(profile.educationEntries.length, "entry", "entries") : latestEducation?.fieldOfStudy} />
      <Row href={SECTIONS.preferences.href} label="Salary" value={salary} />
      <Row href={SECTIONS.preferences.href} label="Location" value={location.length ? location.join(" · ") : null} />
      <Row href={SECTIONS.resumes.href} label="Resumes" value={resumes.error ? "Could not load" : resumes.files.length ? plural(resumes.files.length, "version") : null} detail={resumes.files[0] && `Latest: ${resumes.files[0].name}`} />
      <Row href={SECTIONS.projects.href} label="Projects" value={profile.projects.length ? plural(profile.projects.length, "project") : null} detail={profile.projects[0]?.title} emptyText="None added (optional)" />
    </ul>
  </Card>;
}

export function DashboardOverview({ profile, resumes, jobs }: { profile: Profile; resumes: Resumes; jobs: Jobs }) {
  return <div className="min-w-0 space-y-6">
    <QuickActions />
    <SavedJobsSummary {...jobs} />
    <ProfileSummary profile={profile} resumes={resumes} />
  </div>;
}
