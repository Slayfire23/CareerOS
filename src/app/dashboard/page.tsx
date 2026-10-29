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
import { getSavedJobsOverview } from "@/lib/overview";
import { ProfileForm } from "@/components/profile-form";
import { CareerPreferencesForm } from "@/components/career-preferences-form";
import { TechnicalSkills } from "@/components/technical-skills";
import { DashboardOverview } from "@/components/dashboard-overview";
import { Card, LoadingBlock, PageHeader, SectionCard } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

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
    <div className="space-y-8">
      <PageHeader
        eyebrow={profile && profile.displayName !== DEFAULT_DISPLAY_NAME ? `Welcome back, ${profile.displayName}` : "Welcome back"}
        title="Your dashboard"
        description="Everything here comes from what you saved. Nothing is inferred."
      />

      {profile ? (
        <div key={user.id} className="space-y-12">
          <DashboardOverview profile={profile} resumes={resumes} jobs={jobs} />

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
