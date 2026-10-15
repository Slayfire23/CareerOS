import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";

async function DashboardContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="mb-2 text-sm font-semibold">CareerOS</p>
        <h1 className="text-3xl font-bold">Your dashboard</h1>
      </div>

      <p>
        Signed in as <strong>{user.email}</strong>
      </p>

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