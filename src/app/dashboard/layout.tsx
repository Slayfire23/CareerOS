import { cache, Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DashboardNav, MobileNav } from "@/components/dashboard-nav";
import { SignOutButton } from "@/components/sign-out-button";

// Presentation only. Every page and server action below still performs its own
// authentication and ownership checks; this layout is not a security boundary.
const getSignedInUser = cache(async () => {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

async function AccountSummary() {
  const user = await getSignedInUser();
  if (!user) return null;
  return <div className="space-y-3 border-t border-line pt-4">
    <p className="text-xs text-muted">Signed in as<br /><strong className="break-all text-sm text-foreground">{user.email}</strong></p>
    <SignOutButton />
  </div>;
}

function Brand() {
  return <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold tracking-tight">
    <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">C</span>
    CareerOS
  </Link>;
}

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return <div className="flex min-h-full flex-1 flex-col md:flex-row">
    <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow">Skip to content</a>

    <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface p-5 md:flex md:sticky md:top-0 md:h-screen">
      <Brand />
      <nav aria-label="Main" className="flex-1 overflow-y-auto"><DashboardNav /></nav>
      <Suspense fallback={null}><AccountSummary /></Suspense>
    </aside>

    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
      <Brand />
      <MobileNav />
    </header>

    <main id="main" className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 py-8 sm:px-8 sm:py-10">
      {children}
      <div className="mt-10 md:hidden"><Suspense fallback={null}><AccountSummary /></Suspense></div>
    </main>
  </div>;
}
