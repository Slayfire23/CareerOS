import Link from "next/link";
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
import { ProfileForm } from "@/components/profile-form";
import { CareerPreferencesForm } from "@/components/career-preferences-form";
import { TechnicalSkills } from "@/components/technical-skills";
import { SignOutButton } from "@/components/sign-out-button";

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

  const profile = await getCurrentProfile();
  const resumes = await getResumes();

  return (
    <section className="space-y-8">
      <div>
        <p className="mb-2 text-sm font-semibold">CareerOS</p>
        <h1 className="text-3xl font-bold">Your dashboard</h1>
        <p className="mt-3">
          Signed in as <strong>{user.email}</strong>
        </p>
      </div>

      {profile ? (
        <div key={user.id} className="space-y-10">
          <Resumes {...resumes} />
          <ProfileForm profile={profile} />
          <CareerPreferencesForm profile={profile} />
          <LocationPreferencesForm profile={profile} />
          <SalaryExpectationsForm profile={profile} />
          <TechnicalSkills skills={profile.technicalSkills} />
          <ProfessionalExperience entries={profile.professionalExperiences} />
          <Education entries={profile.educationEntries} />
          <Projects entries={profile.projects} />
        </div>
      ) : (
        <p role="alert">
          Your profile is missing. Please sign out and sign in again
          to finish setting up your account.
        </p>
      )}

      <Link className="inline-block underline" href="/jobs">View saved jobs</Link>
      <SignOutButton />
    </section>
  );
}

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <Suspense fallback={<p role="status">Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
