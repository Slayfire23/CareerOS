import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAiConfig } from "@/lib/ai/config";
import { getAnalysisPageData, type AnalysisView } from "@/lib/ai/analysis";
import { VERDICTS, type EvidenceKind, type Verdict } from "@/lib/ai/evidence";
import type { AiStatus, RuleBasis, Suggestion, SuggestionKind } from "@/lib/ai/match-validation";
import { requirementsHref, SECTIONS } from "@/lib/sections";
import { CloudConsentForm, FeedbackForm, RunAnalysisForm } from "@/components/job-match";
import { answerLanguage, LANGUAGE_NOTE } from "@/lib/ai/answer-language";
import { ClarificationPanel, EditAnswerForm, TakeBackForm } from "@/components/job-clarification";
import { AnswerControls, ReviewQuestions } from "@/components/job-review-panel";
import { clarificationFor } from "@/lib/ai/rules/clarifications";
import terminology from "@/lib/ai/rules/data/terminology.json";
import type { EvidenceOrigin } from "@/lib/ai/evidence";
import { CLOUD_MODEL_LABEL, CLOUD_PROVIDER_NAME } from "@/lib/ai/consent";
import { ButtonLink, Card, EmptyState, LoadingBlock, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Requirement analysis" };

const VERDICT_STYLE: Record<Verdict, { label: string; className: string }> = {
  // Supported stays the verdict; "Self-reported" says where its evidence came from. Everything in a profile
  // is self-reported, because CareerOS has no independent verification.
  supported: { label: "Supported — Self-reported", className: "bg-accent-soft text-accent-text" },
  possible: { label: "Possible", className: "border text-foreground" },
  gap: { label: "Not supported", className: "bg-danger-soft text-danger-text" },
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
const methodLabel = (provider: string, model?: string | null) =>
  provider === "anthropic" ? `${CLOUD_MODEL_LABEL} (${CLOUD_PROVIDER_NAME})`
  : provider === "ollama" ? `Local AI (${model ?? "Ollama"})`
  : provider === "hybrid" ? `Rules + local AI (${model ?? "Ollama"})`
  : provider === "assisted" ? `Rules + AI suggestions (${model ?? "Ollama"})`
  : "Rules engine";
/** Hybrid results: who decided each finding, and why local AI did not when it didn't. */
const FINDING_SOURCE: Record<AiStatus, string> = {
  accepted: "Local AI match, checked by code",
  not_eligible: "Rules engine (experience, education, durations, and credentials are never sent to local AI)",
  contains_instructions: "Rules engine (this requirement needs your confirmation, so local AI was not used)",
  not_needed: "Rules engine (exact match)",
  no_match: "Rules engine (local AI found no other match)",
  rejected: "Rules engine (local AI's answer failed verification and was discarded)",
  unavailable: "Rules engine (local AI was unavailable)",
};
const ORIGIN_NOTE = (sources: EvidenceOrigin[] | undefined) =>
  sources?.includes("candidate_answer")
    ? `From ${sources.includes("profile") ? "your profile and " : ""}an answer you gave. Self-reported: CareerOS hasn't independently verified it.`
    : "From your profile. Self-reported: CareerOS hasn't independently verified it.";
/** Where each result came from. All of these are deterministic rules, never AI. */
const RULE_SOURCE: Record<RuleBasis, string> = {
  candidate_answer: "Rules engine: reading your answer to a question",
  candidate_denied: "Rules engine: your answer says you don't have this",
  stated_absent: "Rules engine: your profile says you don't have this",
  listed_skill: "Rules engine: a skill you list",
  alternate_name: "Rules engine: a skill you list, under a known alternate name",
  related_technology: "Rules engine: a related technology from the reviewed table",
  described_in_work: "Rules engine: described in one of your roles or projects",
  project: "Rules engine: from a project, not listed as a skill",
  employment_dates: "Rules engine: your employment dates",
  role_description: "Rules engine: your role titles and descriptions",
  education: "Rules engine: your education",
  no_evidence: "Rules engine: nothing in your profile speaks to this",
  needs_confirmation: "Rules engine: waiting for your confirmation",
};
const SUGGESTION_GROUPS: { kind: SuggestionKind; title: string }[] = [
  { kind: "alternate_name", title: "Possible skill aliases" },
  { kind: "related_technology", title: "Related technologies" },
  { kind: "relevant_evidence", title: "Evidence to review" },
  { kind: "profile_gap", title: "Potential profile gaps" },
];
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

function HybridSummary({ analysis }: { analysis: AnalysisView }) {
  const count = (status: AiStatus) => analysis.findings.filter(f => f.aiStatus === status).length;
  const matched = count("accepted");
  const unavailable = count("unavailable");
  const discarded = count("rejected");
  return <div role="status" className="space-y-1 rounded-lg border border-l-4 border-l-accent/60 bg-surface p-3 text-sm">
    <p>The rules engine decided every requirement. Local AI added {matched === 1 ? "1 match" : `${matched} matches`} for skills listed under other names{matched ? ", each checked by code against your profile" : ""}.</p>
    {unavailable > 0 && <p>Local AI was unavailable for {unavailable === 1 ? "1 requirement" : `${unavailable} requirements`}, so {unavailable === 1 ? "it shows" : "they show"} rules-engine results only. Run the analysis again later to include local AI.</p>}
    {discarded > 0 && <p className="text-muted">{discarded === 1 ? "1 local AI answer" : `${discarded} local AI answers`} failed verification and {discarded === 1 ? "was" : "were"} discarded; the rules-engine result is shown instead.</p>}
  </div>;
}

function AiSuggestions({ analysis }: { analysis: AnalysisView }) {
  const requirements = new Map(analysis.requirements.map(r => [r.index, r]));
  const groups = SUGGESTION_GROUPS.map(g => ({ ...g, items: analysis.suggestions.filter((s: Suggestion) => s.kind === g.kind) })).filter(g => g.items.length);
  return <section aria-labelledby="suggestions-heading" className="space-y-3 rounded-xl border border-dashed bg-surface-muted p-4 sm:p-5">
    <div className="space-y-1">
      <h3 id="suggestions-heading" className="text-base font-semibold">AI suggestions</h3>
      <p className="text-sm text-muted">From local AI ({analysis.model ?? "Ollama"}) on CareerOS&apos;s own computer. These are only guesses, and they don&apos;t affect the results above. Check each one yourself.</p>
    </div>
    {analysis.aiAssist === "unavailable" && <p role="status" className="rounded-lg border border-l-4 border-l-foreground/40 bg-surface p-3 text-sm">
      Local AI is unavailable right now, so AI suggestions may be missing. The results above are complete. CareerOS never switches to a paid AI provider instead. Run the analysis again later to get suggestions.
    </p>}
    {analysis.aiAssist !== "unavailable" && !groups.length && <p className="text-sm text-muted">No suggestions for this analysis.</p>}
    {groups.map(group => <div key={group.kind} className="space-y-2">
      <h4 className="text-sm font-semibold">{group.title}</h4>
      <ul className="space-y-2">
        {group.items.map((s, i) => <li key={`${s.requirementIndex}-${i}`} className="rounded-lg border bg-surface p-3 text-sm">
          <p className="text-xs font-medium text-muted">Requirement {s.requirementIndex + 1}: {requirements.get(s.requirementIndex)?.text} · {s.knownToRules ? "Local AI, relationship known to the reviewed table" : "Local AI, needs your review"}</p>
          <p>{s.text}</p>
        </li>)}
      </ul>
    </div>)}
  </section>;
}

function VerdictPill({ verdict, answered }: { verdict: Verdict; answered?: boolean }) {
  const style = VERDICT_STYLE[verdict];
  const label = answered && verdict !== "supported" && verdict !== "insufficient_information" ? `${style.label} — Self-reported` : style.label;
  return <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>{label}</span>;
}

function ReviewSection({ data, analysisId }: { data: NonNullable<Awaited<ReturnType<typeof getAnalysisPageData>>>; analysisId: string }) {
  const review = data.review!;
  const { queue } = review;
  const remaining = queue.questions.length + queue.notShown;
  return <section aria-labelledby="review-heading" className="space-y-3 rounded-xl border bg-surface-muted p-4 sm:p-5">
    <h3 id="review-heading" className="text-base font-semibold">What CareerOS couldn&apos;t establish</h3>
    <p className="text-sm">{queue.settled} of {queue.total} settled from your profile and answers. {remaining === 0 ? "No questions right now." : `${remaining === 1 ? "1 question" : `${remaining} questions`} for the rest.`}{queue.suppressedByEarlierAnswers > 0 && ` ${queue.suppressedByEarlierAnswers} not asked again, because you've already answered.`}</p>
    <p className="text-xs text-muted">Answers are self-reported, and CareerOS doesn&apos;t independently verify them. You can leave any of these as Not enough information.</p>
    {review.changes.length > 0 && <div className="space-y-1">
      <h4 className="text-sm font-semibold">Changed by your answers</h4>
      <ul className="space-y-1 text-sm">
        {review.changes.map((c, i) => <li key={`${c.requirementText}-${i}`}>{c.requirementText}: {VERDICT_STYLE[c.before as Verdict]?.label ?? c.before} → {VERDICT_STYLE[c.after as Verdict]?.label ?? c.after}</li>)}
      </ul>
    </div>}
    <ReviewQuestions analysisId={analysisId} questions={queue.questions} roles={data.roles} />
    {queue.notShown > 0 && <p className="text-sm text-muted">{queue.notShown} more not shown, to keep this short. They appear as you answer these.</p>}
    {review.answers.length > 0 && <div className="space-y-2">
      <h4 className="text-sm font-semibold">Your answers</h4>
      <ul className="divide-y text-sm">
        {review.answers.map(a => <li key={a.id} className="space-y-1 py-2">
          <p className="text-xs font-medium text-muted">{dateTime.format(a.createdAt)} · {a.requirementText}{a.status === "REVOKED" ? " · Revoked, no longer counts" : ""}</p>
          <p className="break-words">{a.outcome === "DENIED" ? "You said you don't have this." : a.detail ?? a.qualification}{a.roleTitle && <span className="text-muted"> ({a.roleTitle})</span>}</p>
          {a.detail && a.status === "ACTIVE" && answerLanguage(a.detail) !== "en" && <p className="text-xs text-muted">{LANGUAGE_NOTE}</p>}
          <AnswerControls clarificationId={a.id} detail={a.outcome === "ROLE_DETAIL_ADDED" ? a.detail : null} label={`answer about ${a.requirementText}`} status={a.status} />
        </li>)}
      </ul>
    </div>}
  </section>;
}

function Findings({ analysis, jobId, roles, declined, review }: { analysis: AnalysisView; jobId: string; roles: { id: string; label: string }[]; declined: Set<string>; review: boolean }) {
  const requirements = new Map(analysis.requirements.map(r => [r.index, r]));
  return <ol className="space-y-3">
    {analysis.findings.map(finding => {
      const requirement = requirements.get(finding.requirementIndex);
      const feedback = analysis.feedback[String(finding.requirementIndex)];
      const question = requirement ? clarificationFor(requirement, finding) : null;
      const aiNote = analysis.suggestions.find(s => s.kind === "profile_gap" && s.requirementIndex === finding.requirementIndex)?.text ?? null;
      return <li key={finding.requirementIndex} className="space-y-3 rounded-xl border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted">Requirement {finding.requirementIndex + 1} · {requirement?.priority} · {requirement?.category}</p>
            <h3 className="break-words font-semibold">{requirement?.text}</h3>
          </div>
          <VerdictPill verdict={finding.verdict} answered={finding.evidenceSources?.includes("candidate_answer")} />
        </div>
        {finding.aiStatus && <p className={`text-xs font-medium ${finding.method === "local_ai" ? "text-accent-text" : "text-muted"}`}>
          {FINDING_SOURCE[finding.aiStatus]}
        </p>}
        {!finding.aiStatus && finding.basis && <p className="text-xs font-medium text-muted">{RULE_SOURCE[finding.basis]}</p>}
        <p className="text-sm">{finding.explanation}</p>
        {finding.review && <p className="rounded-lg border border-l-4 border-l-foreground/40 bg-surface-muted p-3 text-sm">
          Needs your confirmation. <Link href={requirementsHref(jobId)} className="font-medium text-accent-text underline">Check this requirement in the job review</Link>, confirm it if it is a real requirement, then run the analysis again.
        </p>}
        {finding.citations.length > 0 && <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted">Evidence. {ORIGIN_NOTE(finding.evidenceSources)}</p>
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
        {!review && <ClarificationPanel analysisId={analysis.id} current={question && !declined.has(question.requirementText) ? question : null} roles={roles} aiNote={aiNote} />}
        {finding.rulesOnlyVerdict && <p className="text-xs text-muted">From the rules alone, before your answer: {VERDICT_STYLE[finding.rulesOnlyVerdict].label}.</p>}
        {!review && question && declined.has(question.requirementText) && <p className="text-xs text-muted">You said you don&apos;t have this, so it won&apos;t be asked again for this job.</p>}
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
        : data.localAi.available
          ? `Compares this job's reviewed requirements with your confirmed profile. Deterministic rules decide every result. Optionally, local AI (${data.localAi.model}) on CareerOS's own computer adds suggestions for you to review, which never change a result. It can still be wrong, so record whether you agree with each finding.`
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
        <RunAnalysisForm jobId={job.id} disabled={!ready || !data.configured || data.remainingToday === 0} hasAnalysis={!!latest} cloud={data.cloud} localAi={data.localAi} />
      </div>
      <details className="disclosure rounded-lg border p-3 text-sm">
        <summary>What is sent, and where</summary>
        <p className="text-muted">The rules engine runs on CareerOS&apos;s server and sends nothing to any AI service.{data.localAi.available && ` With AI suggestions, requirements the rules engine did not support are also sent, with your skill names, role titles and descriptions, and projects (no dates or education, and with any remarks or claims removed), to CareerOS's own computer running ${data.localAi.model}. It does not go to an AI company, and it can't change your results.`}{" "}Some alternate names were checked against public sources. {terminology.attribution.onet} {terminology.attribution.esco}{data.cloud.available && ` ${CLOUD_MODEL_LABEL} sends your reviewed requirements, skills, role titles, dates, and descriptions, education, and projects to ${CLOUD_PROVIDER_NAME}, but not your email, name, headline, goals, salary, location, company or school names, links, or resume files. Your profile name, the employer and school names in your profile, this job's company, email addresses, phone numbers, and links are replaced in the text first, but other names you wrote can still be sent.`}</p>
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
        <p className="text-sm text-muted">{dateTime.format(latest.createdAt)} · {methodLabel(latest.provider, latest.model)} ({latest.methodVersion})</p>
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
      {latest.provider === "hybrid" && <HybridSummary analysis={latest} />}
      <h3 className="text-base font-semibold">Matching results</h3>
      <p className="text-sm text-muted">Decided by CareerOS&apos;s deterministic rules from what you entered in your profile. Nothing here has been independently verified.</p>
      {data.review && <ReviewSection data={data} analysisId={latest.id} />}
      <Findings analysis={latest} jobId={job.id} roles={data.roles} declined={new Set(data.declined.map(d => d.requirementText))} review={!!data.review} />
      {latest.provider === "assisted" && <AiSuggestions analysis={latest} />}
    </section> : <EmptyState title="No analysis yet">
      {ready ? "Run an analysis to compare these requirements with your profile." : "Once the requirements are reviewed, you can run an analysis here."}
    </EmptyState>}

    {!data.review && data.answers.length > 0 && <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Answers you&apos;ve added</h2>
      <p className="text-sm text-muted">Each counts only for the requirement it answers, on any job. They&apos;re self-reported, and you can edit or delete them at any time.</p>
      <ul className="divide-y text-sm">
        {data.answers.map(answer => <li key={answer.id} className="space-y-1 py-2">
          <p className="text-xs font-medium text-muted">Added {dateTime.format(answer.createdAt)} about: {answer.requirementText}</p>
          <p className="break-words">{answer.detail ?? answer.qualification}{answer.roleTitle && <span className="text-muted"> ({answer.roleTitle})</span>}</p>
          {answer.detail && answerLanguage(answer.detail) !== "en" && <p className="text-xs text-muted">{LANGUAGE_NOTE}</p>}
          {answer.detail && <EditAnswerForm clarificationId={answer.id} detail={answer.detail} label={`answer about ${answer.requirementText}`} />}
          <TakeBackForm clarificationId={answer.id} label={`answer about ${answer.requirementText}`} />
        </li>)}
      </ul>
    </Card>}

    {history.length > 0 && <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Recent runs</h2>
      <ul className="divide-y text-sm">
        {history.map(run => {
          const counts = run.analysis?.verdictCounts as Record<Verdict, number> | undefined;
          return <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-muted">{dateTime.format(run.startedAt)} · {methodLabel(run.provider, run.model)}</span>
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
