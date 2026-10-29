// Small decorative stroke icons. Always aria-hidden; pair with visible text.
const paths = {
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  briefcase: "M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1m-11 0h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Zm-1 6h18",
  plus: "M12 5v14M5 12h14",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  chevron: "m9 6 6 6-6 6",
  check: "m5 12 5 5 9-10",
} as const;

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof paths; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}><path d={paths[name]} /></svg>;
}
