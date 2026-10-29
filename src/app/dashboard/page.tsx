import type { Metadata } from "next";
import { getResumes } from "@/lib/resumes";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { DEFAULT_DISPLAY_NAME } from "@/lib/ensure-profile";
import { MissingProfile } from "@/components/section-page";
import { getSavedJobsOverview } from "@/lib/overview";
import { DashboardOverview } from "@/components/dashboard-overview";
import { LoadingBlock, PageHeader } from "@/components/ui";

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

  const [profile, resumes, jobs] = await Promise.all([getCurrentProfile(), getResumes(), getSavedJobsOverview(user.id, 5)]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={profile && profile.displayName !== DEFAULT_DISPLAY_NAME ? `Welcome back, ${profile.displayName}` : "Welcome back"}
        title="Your dashboard"
        description="Everything here comes from what you saved. Nothing is inferred."
      />

      {profile ? (
        <DashboardOverview key={user.id} profile={profile} resumes={resumes} jobs={jobs} />
      ) : <MissingProfile />}
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
