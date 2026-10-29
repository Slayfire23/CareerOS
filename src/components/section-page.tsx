import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getCurrentProfile } from "@/lib/profile";
import { LoadingBlock, PageHeader } from "@/components/ui";

type Profile = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;

export function MissingProfile() {
  return <p role="alert" className="rounded-lg border border-line bg-surface p-4">
    Your profile is missing. Please sign out and sign in again to finish setting up your account.
  </p>;
}

// getCurrentProfile verifies the session on the server and redirects to /login without one.
async function ProfileContent({ render }: { render: (profile: Profile) => ReactNode }) {
  await connection();
  const profile = await getCurrentProfile();
  return profile ? render(profile) : <MissingProfile />;
}

export function ProfileSectionPage({ title, description, render }: { title: string; description: ReactNode; render: (profile: Profile) => ReactNode }) {
  return <div className="space-y-8">
    <PageHeader title={title} description={description} />
    <Suspense fallback={<LoadingBlock variant="form" label={`Loading ${title.toLowerCase()}…`} />}>
      <ProfileContent render={render} />
    </Suspense>
  </div>;
}
