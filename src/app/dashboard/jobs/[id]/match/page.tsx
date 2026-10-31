import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAiConfig } from "@/lib/ai/config";
import { getAnalysisPageData, type AnalysisView } from "@/lib/ai/analysis";
import { VERDICTS, type EvidenceKind, type Verdict } from "@/lib/ai/evidence";
import { requirementsHref, SECTIONS } from "@/lib/sections";
import { CloudConsentForm, FeedbackForm, RunAnalysisForm } from "@/components/job-match";
import { CLOUD_MODEL_LABEL, CLOUD_PROVIDER_NAME } from "@/lib/ai/consent";
import { ButtonLink, Card, EmptyState, LoadingBlock, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Requirement analysis" };

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  supported: { label: "Supported", className: "bg-accent-soft text-accent-text" },
  possible: { label: "Possible", className: "border text-foreground" },
  gap: { label: "Gap", className: "bg-danger-soft text-danger-text" },
  insufficient_information: { label: "Not enough information", className: "bg-surface-muted text-muted" },
};
const EVIDENCE_SOURCE: Record<EvidenceKind, { label: string; href: string }> = {
  skill: { label: "Skill", href: SECTIONS.skills.href },
  experience: { label: "Experience", href: SECTIONS.experience.href },
  education: { label: "Education", href: SECTIONS.education.href },
  project: { label: "Project", href: SECTIONS.projects.href },
};
const RUN_ERRORS: Record<string, string> = {
  service_unavailable: "Service unavailable",
  replay_store_unavailable: "Service unavailable",
  provider_busy: "Provider busy",
  provider_unavailable: "Provider unavailable",
  provider_request_rejected: "Provider unavailable",
  provider_error: "Provider error",
  provider_refused: "Declined by the provider",
  provider_output_truncated: "Result discarded (incomplete)",
  over_budget: "Too large for its budget",
  abandoned: "Interrupted",
  service_timeout: "Timed out",
  provider_timeout: "Timed out",
  provider_output_rejected: "Result discarded (failed verification)",
  response_rejected: "Result discarded (failed verification)",
  service_rejected: "Request rejected",
  invalid_response: "Unreadable response",
  save_failed: "Could not be saved",
};
const methodLabel = (provider: string) => (provider === "anthropic" ? `${CLOUD_MODEL_LABEL} (${CLOUD_PROVIDER_NAME})` : "Rules engine");
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict];
  return <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>;
}

function Findings({ analysis }: { analysis: AnalysisView }) {
  const requirements = new Map(analysis.requirements.map(r => [r.index, r]));
  return <ol className="space-y-3">
    {analysis.findings.map(finding => {
      const requirement = requirements.get(finding.requirementIndex);
      const feedback = analysis.feedback[String(finding.requirementIndex)];
      return <li key={finding.requirementIndex} className="space-y-3 rounded-xl border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted">Requirement {finding.requirementIndex + 1} · {requirement?.priority} · {requirement?.category}</p>
            <h3 className="break-words font-semibold">{requirement?.text}</h3>
          </div>
          <VerdictPill verdict={finding.verdict} />
        </div>
        <p className="text-sm">{finding.explanation}</p>
        {finding.citations.length > 0 && <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">Evidence from your profile</p>
          <ul className="space-y-1.5">
            {finding.citations.map(citation => {
              const source = EVIDENCE_SOURCE[citation.evidenceId.split(":")[0] as EvidenceKind];
              return <li key={`${citation.evidenceId}-${citation.quote}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                <Link href={source.href} className="text-xs font-medium text-accent-text hover:underline">{source.label}</Link>
                <q className="break-words border-l-2 border-accent/50 pl-2 italic text-muted">{citation.quote}</q>
              </li>;
            })}
          </ul>
        </div>}
        {finding.caveats.length > 0 && <ul aria-label="Caveats" className="space-y-1 text-xs text-muted">
          {finding.caveats.map(caveat => <li key={caveat}>Note: {caveat}</li>)}
        </ul>}
        <FeedbackForm analysisId={analysis.id} version={analysis.feedbackVersion} requirementIndex={finding.requirementIndex}
          current={feedback?.choice ?? null} note={feedback?.note ?? null} />
      </li>;
    })}
  </ol>;
}

async function MatchContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { id } = await params;
  const config = readAiConfig();
  const data = await getAnalysisPageData(user.id, id, config);
  if (!data) notFound();
  const { job, readiness, latest, history } = data;
  const ready = readiness === "ready";

  return <div className="space-y-6">
    <PageHeader
      eyebrow={`${job.title} at ${job.company}`}
      title="Requirement analysis"
      description={data.cloud.available
        ? `Compares this job's reviewed requirements with your confirmed profile, using the rules engine on CareerOS or, with your consent, ${CLOUD_MODEL_LABEL}. Every result is checked against your profile before it is saved. It can still be wrong, so record whether you agree with each finding.`
        : "Compares this job's reviewed requirements with your confirmed profile using deterministic rules. No AI provider is used and nothing is inferred. It can be wrong, so record whether you agree with each finding."}
      actions={<ButtonLink href={requirementsHref(job.id)}>Review requirements</ButtonLink>}
    />

    {!ready && <div role="status" className="rounded-xl border border-l-4 border-l-foreground/40 bg-surface p-4 text-sm">
      {readiness === "not_reviewed" && "Review and save this job's requirements before running an analysis."}
      {readiness === "out_of_date" && "The job description changed after your requirement review. Review the requirements again before running a new analysis."}
      {readiness === "no_requirements" && "Your saved review has no requirements. Add at least one before running an analysis."}{" "}
      <Link href={requirementsHref(job.id)} className="font-medium text-accent-text underline">Review requirements</Link>
    </div>}

    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Run an analysis</h2>
          <p className="text-sm text-muted">
            {data.configured ? `${data.remainingToday} of ${data.dailyLimit} analyses left in the last 24 hours.` : "Requirement analysis is not available right now."}
          </p>
        </div>
        <RunAnalysisForm jobId={job.id} disabled={!ready || !data.configured || data.remainingToday === 0} hasAnalysis={!!latest} cloud={data.cloud} />
      </div>
      <details className="disclosure rounded-lg border p-3 text-sm">
        <summary>What is sent to the analysis service</summary>
        <p className="text-muted">Your reviewed requirements, and your skills, role titles, dates, and descriptions, education (qualification, field, dates, details), and projects. Not sent: your email, name, headline, goals, salary, location, company or school names, links, or resume files. Results are checked again before they are saved, and the service keeps no copy.{data.cloud.available && ` The rules engine runs on CareerOS and sends nothing to an AI provider. ${CLOUD_MODEL_LABEL} sends this information to ${CLOUD_PROVIDER_NAME}. Your profile name, the employer and school names in your profile, this job's company, email addresses, phone numbers, and links are replaced in the text first, but other names you wrote can still be sent.`}</p>
      </details>
    </Card>

    {data.cloud.available && <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Cloud analysis consent</h2>
      <p className="text-sm text-muted">{CLOUD_MODEL_LABEL} is optional and off until you agree. The rules engine stays available either way.</p>
      <CloudConsentForm consentCurrent={data.cloud.consentCurrent} />
    </Card>}

    {latest ? <section aria-labelledby="latest-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="latest-heading" className="text-lg font-semibold">Latest analysis</h2>
        <p className="text-sm text-muted">{dateTime.format(latest.createdAt)} · {methodLabel(latest.provider)} ({latest.methodVersion})</p>
      </div>
      {(latest.outOfDate.requirements || latest.outOfDate.profile) && <p role="status" className="rounded-lg border border-l-4 border-l-foreground/40 bg-surface p-3 text-sm">
        This analysis is out of date: {latest.outOfDate.requirements && latest.outOfDate.profile ? "the requirements and your profile have changed" : latest.outOfDate.requirements ? "the reviewed requirements have changed" : "your profile has changed"} since it ran. Run it again for current results.
      </p>}
      <ul aria-label="Verdict counts" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {VERDICTS.map(v => <li key={v} className="rounded-xl border bg-surface px-4 py-3">
          <p className="text-2xl font-bold tabular-nums">{latest.verdictCounts[v]}</p>
          <p className="text-sm text-muted">{VERDICT_STYLE[v].label}</p>
        </li>)}
      </ul>
      <p className="text-xs text-muted">Counts describe the findings below. They are not a fit score.</p>
      <Findings analysis={latest} />
    </section> : <EmptyState title="No analysis yet">
      {ready ? "Run an analysis to compare these requirements with your profile." : "Once the requirements are reviewed, you can run an analysis here."}
    </EmptyState>}

    {history.length > 0 && <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Recent runs</h2>
      <ul className="divide-y text-sm">
        {history.map(run => {
          const counts = run.analysis?.verdictCounts as Record<Verdict, number> | undefined;
          return <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-muted">{dateTime.format(run.startedAt)} · {methodLabel(run.provider)}</span>
            <span>
              {run.status === "SUCCEEDED" && counts ? VERDICTS.filter(v => counts[v]).map(v => `${counts[v]} ${VERDICT_STYLE[v].label.toLowerCase()}`).join(" · ")
                : run.status === "FAILED" ? (RUN_ERRORS[run.errorCode ?? ""] ?? "Failed")
                : "In progress"}
            </span>
          </li>;
        })}
      </ul>
    </Card>}
  </div>;
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  return <div className="space-y-6">
    <Link href={SECTIONS.analysis.href} className="text-sm font-medium text-accent-text hover:underline">← Back to job analysis</Link>
    <Suspense fallback={<LoadingBlock variant="form" label="Loading requirement analysis…" />}><MatchContent params={params} /></Suspense>
  </div>;
}
