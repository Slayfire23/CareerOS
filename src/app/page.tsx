import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { Icon } from "@/components/icons";

const steps = [
  { title: "Record what you've done", body: "Skills, roles, education, and projects, in your own words. Only you can see them." },
  { title: "Keep every resume", body: "Upload PDF versions and keep them all. Suggestions from a resume wait for your review." },
  { title: "Read postings closely", body: "Save a job and pick out its requirements, each tied to the line of the posting it came from." },
];

// Illustrative only: shows the requirement-review idea, not real user data.
function ReviewPreview() {
  const rows = [
    { text: "3+ years with SolidWorks", tag: "Required", confirmed: true },
    { text: "Experience with injection molding", tag: "Preferred", confirmed: true },
    { text: "Familiarity with GD&T", tag: "Unspecified", confirmed: false },
  ];
  return <figure aria-label="Example of reviewing job requirements" className="relative rounded-2xl border border-line bg-surface p-4 shadow-xl shadow-black/5 sm:p-5">
    <div className="flex items-center justify-between border-b border-line pb-3">
      <div>
        <p className="text-sm font-semibold">Product Design Engineer</p>
        <p className="text-xs text-muted">Example posting · 3 requirements found</p>
      </div>
      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-text">Your review</span>
    </div>
    <ul className="mt-3 space-y-2">
      {rows.map(row => <li key={row.text} className="flex items-start gap-3 rounded-lg border border-line p-3">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded ${row.confirmed ? "bg-accent text-white" : "border border-line"}`}>{row.confirmed && <Icon name="check" className="h-3.5 w-3.5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{row.text}</span>
          <span className="mt-0.5 block truncate border-l-2 border-accent/40 pl-2 text-xs italic text-muted">“…{row.text.toLowerCase()} …”</span>
        </span>
        <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-muted">{row.tag}</span>
      </li>)}
    </ul>
    <figcaption className="mt-3 text-xs text-muted">Every requirement points back to the posting. Nothing is saved until you confirm it.</figcaption>
  </figure>;
}

export default function Home() {
  return <div className="relative flex flex-1 flex-col overflow-hidden">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
    <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-0 -z-10 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">C</span>
        CareerOS
      </Link>
      <nav aria-label="Account" className="flex gap-2">
        <ButtonLink href="/login">Sign in</ButtonLink>
        <ButtonLink href="/signup" variant="primary" className="hidden sm:inline-flex">Create account</ButtonLink>
      </nav>
    </header>

    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-8 sm:px-8 sm:pt-16">
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" /> Private by default · Built for real job searches
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Know what a job asks for, <span className="text-accent-text">and what you&apos;ve actually done.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">CareerOS keeps your profile, resumes, and saved postings side by side. It never invents qualifications. You decide what&apos;s true.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/signup" variant="primary" className="px-5 py-3 text-base">Create your account</ButtonLink>
            <ButtonLink href="/login" className="px-5 py-3 text-base">Sign in</ButtonLink>
          </div>
        </div>
        <ReviewPreview />
      </section>

      <section aria-labelledby="how-heading" className="mt-20 space-y-6">
        <h2 id="how-heading" className="text-sm font-semibold uppercase tracking-wider text-muted">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => <li key={step.title} className="rounded-xl border border-line bg-surface p-5">
            <span className="font-mono text-sm text-accent-text">0{index + 1}</span>
            <h3 className="mt-2 font-semibold">{step.title}</h3>
            <p className="mt-1.5 text-sm text-muted">{step.body}</p>
          </li>)}
        </ol>
      </section>
    </main>

    <footer className="border-t border-line px-4 py-6 text-center text-sm text-muted">
      CareerOS · Your data stays yours. You confirm everything that is saved.
    </footer>
  </div>;
}
