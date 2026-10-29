"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { SECTIONS, type SectionKey } from "@/lib/sections";

const NAV_ORDER: SectionKey[] = ["overview", "profile", "preferences", "skills", "experience", "education", "projects", "resumes", "jobs", "analysis"];

function isCurrent(key: SectionKey, pathname: string) {
  const href = SECTIONS[key].href;
  if (key === "overview") return pathname === href;
  // A job's requirement review belongs to Job analysis, not Saved jobs.
  const isRequirements = /^\/dashboard\/jobs\/[^/]+\/requirements/.test(pathname);
  if (key === "analysis") return pathname === href || isRequirements;
  if (key === "jobs" && isRequirements) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return <ul className="space-y-1">
    {NAV_ORDER.map(key => {
      const { href, label } = SECTIONS[key];
      const current = isCurrent(key, pathname);
      return <li key={key}>
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={current ? "page" : undefined}
          className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${current ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}
        >
          {label}
        </Link>
      </li>;
    })}
  </ul>;
}

function CurrentNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinks pathname={usePathname()} onNavigate={onNavigate} />;
}

// Dynamic routes read the pathname at request time, so it must sit inside Suspense.
// The fallback is the same menu without the current-page highlight.
export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  return <Suspense fallback={<NavLinks pathname="" onNavigate={onNavigate} />}>
    <CurrentNavLinks onNavigate={onNavigate} />
  </Suspense>;
}

export function MobileNav() {
  return <details className="group relative md:hidden">
    <summary className="cursor-pointer list-none rounded-lg border border-line px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <span className="group-open:hidden">Menu</span><span className="hidden group-open:inline">Close</span>
    </summary>
    <nav aria-label="Main" className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg">
      <DashboardNav onNavigate={() => document.activeElement instanceof HTMLElement && document.activeElement.closest("details")?.removeAttribute("open")} />
    </nav>
  </details>;
}
