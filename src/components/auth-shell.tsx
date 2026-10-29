import Link from "next/link";
import type { ReactNode } from "react";

// Centered card used by sign-in, sign-up, and password-recovery pages.
export function AuthShell({ children }: { children: ReactNode }) {
  return <main className="relative flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
    <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-bold tracking-tight">
      <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">C</span>
      CareerOS
    </Link>
    <div className="w-full max-w-md space-y-5 rounded-2xl border bg-surface p-6 shadow-sm sm:p-8 [&_a:not(.btn)]:text-accent-text">
      {children}
    </div>
  </main>;
}
