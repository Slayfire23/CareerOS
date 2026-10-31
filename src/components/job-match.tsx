"use client";
import { useActionState, useId } from "react";
import { runJobMatch, saveMatchFeedback, type FeedbackState, type MatchRunState } from "@/app/jobs/match-actions";

export function RunAnalysisForm({ jobId, disabled, hasAnalysis }: { jobId: string; disabled: boolean; hasAnalysis: boolean }) {
  const [state, action, pending] = useActionState(runJobMatch, {} as MatchRunState);
  return <form action={action} aria-label="Run requirement analysis" className="space-y-3">
    <input type="hidden" name="jobId" value={jobId} />
    <button type="submit" className="btn btn-primary" disabled={disabled || pending}>
      {pending ? "Analyzing…" : hasAnalysis ? "Run analysis again" : "Run analysis"}
    </button>
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
