"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Section links point at anchors on /dashboard until each section moves to its own page.
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard#profile", label: "Profile" },
  { href: "/dashboard#preferences", label: "Preferences" },
  { href: "/dashboard#skills", label: "Skills" },
  { href: "/dashboard#experience", label: "Experience" },
  { href: "/dashboard#education", label: "Education" },
  { href: "/dashboard#projects", label: "Projects" },
  { href: "/dashboard#resumes", label: "Resumes" },
  { href: "/jobs", label: "Saved jobs" },
  { href: "/jobs", label: "Job analysis" },
] as const;

export function DashboardNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <ul className="space-y-1">
    {NAV_ITEMS.map(({ href, label }) => {
      const current = href === pathname;
      return <li key={label}>
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
