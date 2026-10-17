import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/profile";
import { ProfileForm } from "@/components/profile-form";
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
        <ProfileForm key={user.id} profile={profile} />
      ) : (
        <p role="alert">
          Your profile is missing. Please sign out and sign in again
          to finish setting up your account.
        </p>
      )}

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