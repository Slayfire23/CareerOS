// Signed-in app sections. Section links point at anchors on /dashboard until each
// section moves to its own page.
export const SECTIONS = {
  overview: { href: "/dashboard", label: "Overview" },
  profile: { href: "/dashboard#profile", label: "Profile" },
  preferences: { href: "/dashboard#preferences", label: "Preferences" },
  skills: { href: "/dashboard#skills", label: "Skills" },
  experience: { href: "/dashboard#experience", label: "Experience" },
  education: { href: "/dashboard#education", label: "Education" },
  projects: { href: "/dashboard#projects", label: "Projects" },
  resumes: { href: "/dashboard#resumes", label: "Resumes" },
  jobs: { href: "/jobs", label: "Saved jobs" },
  analysis: { href: "/jobs", label: "Job analysis" },
} as const;

export type SectionKey = keyof typeof SECTIONS;
