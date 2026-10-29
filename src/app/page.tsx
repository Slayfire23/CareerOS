import Link from "next/link";
import { ButtonLink } from "@/components/ui";

const features = [
  { title: "One private career profile", body: "Keep skills, experience, education, projects, and job preferences together. Only you can see them." },
  { title: "Every resume version", body: "Upload PDF resumes and keep each version. Review suggestions from a resume before anything is saved." },
  { title: "Saved jobs, reviewed by you", body: "Paste job postings and pick out their requirements, with each one tied to the posting text it came from." },
];

export default function Home() {
  return <div className="flex flex-1 flex-col">
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">C</span>
        CareerOS
      </Link>
      <nav aria-label="Account" className="flex gap-2">
        <ButtonLink href="/login">Sign in</ButtonLink>
        <ButtonLink href="/signup" variant="primary">Create account</ButtonLink>
      </nav>
    </header>

    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-10 sm:px-8 sm:pt-20">
      <section className="max-w-2xl space-y-5">
        <p className="text-sm font-medium text-accent-text">Career organizer</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Your career information, organized and private.</h1>
        <p className="text-lg text-muted">CareerOS keeps your profile, resumes, and the jobs you are considering in one place, so you can compare postings against what you have actually done.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/signup" variant="primary" className="px-5 py-3 text-base">Get started</ButtonLink>
          <ButtonLink href="/login" className="px-5 py-3 text-base">I already have an account</ButtonLink>
        </div>
      </section>

      <section aria-label="Features" className="mt-16 grid gap-4 sm:grid-cols-3">
        {features.map(feature => <div key={feature.title} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">{feature.title}</h2>
          <p className="mt-2 text-sm text-muted">{feature.body}</p>
        </div>)}
      </section>
    </main>

    <footer className="border-t border-line px-4 py-6 text-center text-sm text-muted">
      CareerOS never invents qualifications. You confirm everything that is saved.
    </footer>
  </div>;
}
