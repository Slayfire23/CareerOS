// Signed-in app sections, all under /dashboard.
export const SECTIONS = {
  overview: { href: "/dashboard", label: "Overview" },
  profile: { href: "/dashboard/profile", label: "Profile" },
  preferences: { href: "/dashboard/preferences", label: "Preferences" },
  skills: { href: "/dashboard/skills", label: "Skills" },
  experience: { href: "/dashboard/experience", label: "Experience" },
  education: { href: "/dashboard/education", label: "Education" },
  projects: { href: "/dashboard/projects", label: "Projects" },
  resumes: { href: "/dashboard/resumes", label: "Resumes" },
  jobs: { href: "/dashboard/jobs", label: "Saved jobs" },
  analysis: { href: "/dashboard/analysis", label: "Job analysis" },
} as const;

export type SectionKey = keyof typeof SECTIONS;

export const requirementsHref = (jobId: string) => `${SECTIONS.jobs.href}/${jobId}/requirements`;
export const resumeReviewHref = (key: string) => `${SECTIONS.resumes.href}/review/${encodeURIComponent(key)}`;
