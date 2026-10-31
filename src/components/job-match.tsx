"use client";
import { useActionState, useId, useState } from "react";
import {
  runJobMatch, saveMatchFeedback, setCloudConsent, type ConsentState, type FeedbackState, type MatchRunState,
} from "@/app/jobs/match-actions";
import { CLOUD_MODEL_LABEL, CLOUD_NOT_SENT, CLOUD_PROVIDER_NAME, CLOUD_SENT } from "@/lib/ai/consent";

type CloudStatus = { available: boolean; consentCurrent: boolean };

export function RunAnalysisForm({ jobId, disabled, hasAnalysis, cloud }: {
  jobId: string;
  disabled: boolean;
  hasAnalysis: boolean;
  cloud: CloudStatus;
}) {
  const [state, action, pending] = useActionState(runJobMatch, {} as MatchRunState);
  const [provider, setProvider] = useState<"rules" | "anthropic">("rules");
  const cloudBlocked = provider === "anthropic" && !cloud.consentCurrent;
  return <form action={action} aria-label="Run requirement analysis" className="space-y-3">
    <input type="hidden" name="jobId" value={jobId} />
    {cloud.available ? <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Analysis method</legend>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="provider" value="rules" checked={provider === "rules"} onChange={() => setProvider("rules")} className="mt-1" />
        <span><span className="font-medium">Rules engine</span> <span className="text-muted">— runs on CareerOS, free, keyword and date rules only.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="radio" name="provider" value="anthropic" checked={provider === "anthropic"} onChange={() => setProvider("anthropic")} className="mt-1" />
        <span><span className="font-medium">{CLOUD_MODEL_LABEL}</span> <span className="text-muted">— sent to {CLOUD_PROVIDER_NAME}; needs your consent.</span></span>
      </label>
      {cloudBlocked && <p className="hint">Give consent below to use {CLOUD_MODEL_LABEL}.</p>}
    </fieldset> : <input type="hidden" name="provider" value="rules" />}
    <button type="submit" className="btn btn-primary" disabled={disabled || pending || cloudBlocked}>
      {pending ? "Analyzing…" : hasAnalysis ? "Run analysis again" : "Run analysis"}
    </button>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function CloudConsentForm({ consentCurrent }: { consentCurrent: boolean }) {
  const [state, action, pending] = useActionState(setCloudConsent, {} as ConsentState);
  return <form action={action} aria-label="Cloud analysis consent" className="space-y-3 text-sm">
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <p className="font-medium">Sent to {CLOUD_PROVIDER_NAME} for each cloud analysis</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">{CLOUD_SENT.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
      <div className="space-y-1">
        <p className="font-medium">Never sent</p>
        <ul className="list-disc space-y-1 pl-5 text-muted">{CLOUD_NOT_SENT.map(item => <li key={item}>{item}</li>)}</ul>
      </div>
    </div>
    {consentCurrent ? <>
      <p>You gave consent. You can withdraw it at any time; past results stay on this page.</p>
      <button type="submit" name="choice" value="withdraw" className="btn btn-secondary" disabled={pending}>Withdraw consent</button>
    </> : <>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="understood" className="mt-1" required />
        <span>I understand that this information is sent to {CLOUD_PROVIDER_NAME} when I choose {CLOUD_MODEL_LABEL}, and that the rules engine never sends it anywhere.</span>
      </label>
      <button type="submit" name="choice" value="grant" className="btn btn-secondary" disabled={pending}>Give consent</button>
    </>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function FeedbackForm({ analysisId, version, requirementIndex, current, note }: {
  analysisId: string;
  version: number;
  requirementIndex: number;
  current: "agree" | "disagree" | null;
  note: string | null;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(saveMatchFeedback, {} as FeedbackState);
  const label = `finding ${requirementIndex + 1}`;
  return <form action={action} aria-label={`Feedback on ${label}`} className="space-y-2 border-t pt-3">
    <input type="hidden" name="analysisId" value={analysisId} />
    <input type="hidden" name="version" value={version} />
    <input type="hidden" name="requirementIndex" value={requirementIndex} />
    <fieldset disabled={pending} className="space-y-2">
      <legend className="text-xs font-medium text-muted">Do you agree with this finding?</legend>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="choice" value="agree" aria-pressed={current === "agree"}
          className={`btn btn-sm ${current === "agree" ? "btn-primary" : "btn-secondary"}`}>
          Agree<span className="sr-only"> with {label}</span>
        </button>
        <button type="submit" name="choice" value="disagree" aria-pressed={current === "disagree"}
          className={`btn btn-sm ${current === "disagree" ? "btn-danger border-danger-text" : "btn-secondary"}`}>
          Disagree<span className="sr-only"> with {label}</span>
        </button>
        {current && <button type="submit" name="choice" value="clear" className="btn btn-sm btn-secondary">
          Clear<span className="sr-only"> feedback on {label}</span>
        </button>}
        {current && <span className="text-sm text-muted">You {current === "agree" ? "agreed" : "disagreed"}.</span>}
      </div>
      <details className="disclosure" open={!!note}>
        <summary className="text-sm">Note (optional)</summary>
        <label className="label" htmlFor={`${id}-note`}>Note on {label}</label>
        <textarea id={`${id}-note`} name="note" rows={2} maxLength={500} defaultValue={note ?? ""} className="field" />
        <p className="hint">Saved with your Agree or Disagree choice. Up to 500 characters.</p>
      </details>
    </fieldset>
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
  </form>;
}
