import Link from "next/link";
import type { Metadata } from "next";
import { ProfessionalExperience } from "@/components/professional-experience";
import { LocationPreferencesForm } from "@/components/location-preferences-form";
import { SalaryExpectationsForm } from "@/components/salary-expectations-form";
import { Education } from "@/components/education";
import { Projects } from "@/components/projects";
import { Resumes } from "@/components/resumes";
import { getResumes } from "@/lib/resumes";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { DEFAULT_DISPLAY_NAME } from "@/lib/ensure-profile";
import { getSavedJobsOverview, type RecentJob } from "@/lib/overview";
import { SALARY_PERIODS } from "@/lib/salary-expectations";
import { ProfileForm } from "@/components/profile-form";
import { CareerPreferencesForm } from "@/components/career-preferences-form";
import { TechnicalSkills } from "@/components/technical-skills";
import { ButtonLink, Card, EmptyState, LoadingBlock, PageHeader, SectionCard } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

function salarySummary(profile: Profile) {
  const { salaryMinCents: min, salaryMaxCents: max, salaryCurrency: currency, salaryPeriod: period } = profile;
  if (min === null || !currency) return null;
  const range = max !== null && max !== min ? `${formatMoney(min, currency)}–${formatMoney(max, currency)}` : formatMoney(min, currency);
  const label = SALARY_PERIODS.find(item => item.value === period)?.label.toLowerCase();
  return label ? `${range} ${label}` : range;
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function SummaryCard({ title, href, value, detail, empty }: { title: string; href: string; value?: string; detail?: string; empty: string }) {
  return <Link href={href} className="group rounded-xl border border-line bg-surface p-4 shadow-sm transition-colors hover:border-accent focus-visible:border-accent">
    <p className="text-sm font-medium text-muted">{title}</p>
    {value ? <>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {detail && <p className="mt-1 truncate text-sm text-muted">{detail}</p>}
    </> : <p className="mt-1 text-sm text-muted">{empty}</p>}
    <p className="mt-3 text-sm font-medium text-accent-text group-hover:underline">{value ? "View and edit" : "Add"} <span aria-hidden="true">→</span></p>
  </Link>;
}

const statusLabel: Record<RecentJob["reviewStatus"], string> = {
  "not-reviewed": "Requirements not reviewed",
  reviewed: "Requirements reviewed",
  "out-of-date": "Review out of date",
};

function RecentJobs({ jobs, total, reviewed }: { jobs: RecentJob[]; total: number; reviewed: number }) {
  return <Card className="space-y-4">
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold">Recent saved jobs</h2>
      {total > 0 && <p className="text-sm text-muted">{total} saved · {reviewed} with up-to-date reviewed requirements</p>}
    </div>
    {jobs.length ? <ul className="divide-y divide-line">
      {jobs.map(job => <li key={job.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium">{job.title} <span className="text-muted">at {job.company}</span></p>
          <p className="text-sm text-muted">Saved {monthFormat.format(job.createdAt)} · {statusLabel[job.reviewStatus]}{job.reviewStatus !== "not-reviewed" && ` (${job.requirementCount})`}</p>
        </div>
        <Link className="shrink-0 text-sm font-medium text-accent-text hover:underline" href={`/jobs/${job.id}/requirements`}>
          {job.reviewStatus === "reviewed" ? "Open analysis" : "Review requirements"}<span className="sr-only"> for {job.title} at {job.company}</span>
        </Link>
      </li>)}
    </ul> : <EmptyState title="No saved jobs yet" action={<ButtonLink href="/jobs" variant="primary">Save your first job</ButtonLink>}>
      Paste a job description to keep it here and review its requirements.
    </EmptyState>}
    <Link className="inline-block text-sm font-medium text-accent-text hover:underline" href="/jobs">View saved jobs</Link>
  </Card>;
}

function Overview({ profile, resumes, jobs }: { profile: Profile; resumes: Awaited<ReturnType<typeof getResumes>>; jobs: Awaited<ReturnType<typeof getSavedJobsOverview>> }) {
  const latestExperience = profile.professionalExperiences[0];
  const latestEducation = profile.educationEntries[0];
  const salary = salarySummary(profile);
  const preferenceCount = profile.targetRoles.length + profile.industries.length + profile.workArrangements.length + profile.employmentTypes.length;
  const sections = [
    { label: "Headline", done: !!profile.headline },
    { label: "Career preferences", done: preferenceCount > 0 },
    { label: "Location", done: profile.preferredLocations.length > 0 || profile.relocationWillingness !== null || profile.maxCommuteMinutes !== null },
    { label: "Salary", done: salary !== null },
    { label: "Skills", done: profile.technicalSkills.length > 0 },
    { label: "Experience", done: profile.professionalExperiences.length > 0 },
    { label: "Education", done: profile.educationEntries.length > 0 },
    { label: "Resume", done: resumes.files.length > 0 },
  ];
  const remaining = sections.filter(section => !section.done);

  return <div className="space-y-8">
    <section aria-labelledby="quick-actions-heading" className="space-y-3">
      <h2 id="quick-actions-heading" className="sr-only">Quick actions</h2>
      <div className="flex flex-wrap gap-2">
        <ButtonLink variant="primary" href="#resumes">Upload a resume</ButtonLink>
        <ButtonLink href="/jobs">Save a job</ButtonLink>
        <ButtonLink href="#skills">Add a skill</ButtonLink>
        <ButtonLink href="#experience">Add work history</ButtonLink>
      </div>
    </section>

    <section aria-labelledby="summary-heading" className="space-y-3">
      <h2 id="summary-heading" className="text-lg font-semibold">Your profile at a glance</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard title="Headline" href="#profile" value={profile.headline ?? undefined} empty="No headline yet." />
        <SummaryCard title="Skills" href="#skills" value={profile.technicalSkills.length ? `${profile.technicalSkills.length} skill${profile.technicalSkills.length === 1 ? "" : "s"}` : undefined} detail={profile.technicalSkills.slice(0, 4).map(skill => skill.name).join(", ")} empty="No skills added yet." />
        <SummaryCard title="Experience" href="#experience" value={latestExperience ? `${profile.professionalExperiences.length} role${profile.professionalExperiences.length === 1 ? "" : "s"}` : undefined} detail={latestExperience && `Latest: ${latestExperience.jobTitle} at ${latestExperience.company}`} empty="No experience added yet." />
        <SummaryCard title="Education" href="#education" value={latestEducation ? `${profile.educationEntries.length} entr${profile.educationEntries.length === 1 ? "y" : "ies"}` : undefined} detail={latestEducation && `${latestEducation.qualification}, ${latestEducation.institution}`} empty="No education added yet." />
        <SummaryCard title="Target roles" href="#preferences" value={profile.targetRoles.length ? profile.targetRoles.slice(0, 2).join(", ") : undefined} detail={profile.targetRoles.length > 2 ? `+${profile.targetRoles.length - 2} more` : undefined} empty="No target roles yet." />
        <SummaryCard title="Salary expectation" href="#preferences" value={salary ?? undefined} empty="Not set." />
        <SummaryCard title="Resumes" href="#resumes" value={resumes.error ? undefined : resumes.files.length ? `${resumes.files.length} version${resumes.files.length === 1 ? "" : "s"}` : undefined} detail={resumes.files[0] && `Latest: ${resumes.files[0].name}`} empty={resumes.error ? "Resumes could not be loaded." : "No resumes uploaded yet."} />
        <SummaryCard title="Projects (optional)" href="#projects" value={profile.projects.length ? `${profile.projects.length} project${profile.projects.length === 1 ? "" : "s"}` : undefined} detail={profile.projects[0]?.title} empty="None added. Optional." />
      </div>
    </section>

    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3"><RecentJobs {...jobs} /></div>
      <Card className="space-y-3 lg:col-span-2">
        <h2 className="text-lg font-semibold">Profile checklist</h2>
        <p className="text-sm text-muted">{sections.length - remaining.length} of {sections.length} sections have information. Projects are optional and not counted.</p>
        <ul className="space-y-1.5 text-sm">
          {sections.map(section => <li key={section.label} className="flex items-center gap-2">
            <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-xs ${section.done ? "bg-accent text-white" : "border border-line"}`}>{section.done ? "✓" : ""}</span>
            <span className={section.done ? "" : "text-muted"}>{section.label}<span className="sr-only">{section.done ? ": has information" : ": not started"}</span></span>
          </li>)}
        </ul>
      </Card>
    </div>
  </div>;
}

async function DashboardContent() {
  await connection();

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const [profile, resumes, jobs] = await Promise.all([getCurrentProfile(), getResumes(), getSavedJobsOverview(user.id)]);

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow={profile && profile.displayName !== DEFAULT_DISPLAY_NAME ? `Welcome back, ${profile.displayName}` : "Welcome back"}
        title="Your dashboard"
        description="A summary of your career information and saved jobs. Everything here is what you entered; nothing is inferred."
      />

      {profile ? (
        <div key={user.id} className="space-y-12">
          <Overview profile={profile} resumes={resumes} jobs={jobs} />

          <section aria-labelledby="edit-heading" className="space-y-6">
            <div>
              <h2 id="edit-heading" className="text-xl font-semibold">Edit your information</h2>
              <p className="text-sm text-muted">Each section saves separately.</p>
            </div>
            <SectionCard id="resumes"><Resumes {...resumes} /></SectionCard>
            <SectionCard id="profile"><ProfileForm profile={profile} /></SectionCard>
            <div id="preferences" className="scroll-mt-24 space-y-6">
              <Card><CareerPreferencesForm profile={profile} /></Card>
              <Card><LocationPreferencesForm profile={profile} /></Card>
              <Card><SalaryExpectationsForm profile={profile} /></Card>
            </div>
            <SectionCard id="skills"><TechnicalSkills skills={profile.technicalSkills} /></SectionCard>
            <SectionCard id="experience"><ProfessionalExperience entries={profile.professionalExperiences} /></SectionCard>
            <SectionCard id="education"><Education entries={profile.educationEntries} /></SectionCard>
            <SectionCard id="projects"><Projects entries={profile.projects} /></SectionCard>
          </section>
        </div>
      ) : (
        <p role="alert">
          Your profile is missing. Please sign out and sign in again
          to finish setting up your account.
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Loading your dashboard…" />}>
      <DashboardContent />
    </Suspense>
  );
}
