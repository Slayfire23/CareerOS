"use client";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { answerNo, answerWithEntry, answerWithRoleDetail, takeBackAnswer, type ClarificationState } from "@/app/jobs/clarification-actions";
import type { Clarification } from "@/lib/ai/rules/clarifications";
import { DETAIL_MAX } from "@/lib/ai/rules/clarification-limits";
import { SECTIONS } from "@/lib/sections";

const SELF_REPORTED_NOTE = "This is saved to your profile as self-reported, in your own words. The rules read it like any other work description, so saying yes alone doesn't change the result. CareerOS doesn't independently check it, so only add what's accurate.";

function Hidden({ analysisId, requirementIndex }: { analysisId: string; requirementIndex: number }) {
  return <>
    <input type="hidden" name="analysisId" value={analysisId} />
    <input type="hidden" name="requirementIndex" value={requirementIndex} />
  </>;
}
const Status = ({ state }: { state: ClarificationState }) => <>
  {state.error && <p role="alert">{state.error}</p>}
  {state.message && <p role="status">{state.message}</p>}
</>;

function RoleDetailForm({ analysisId, clarification, roles, settled }: { analysisId: string; clarification: Clarification; roles: { id: string; label: string }[]; settled: boolean }) {
  const id = useId();
  const [state, action, pending] = useActionState(answerWithRoleDetail, {} as ClarificationState);
  // Kept here because a form resets after its action, and a turned-away answer shouldn't lose what was typed.
  const [role, setRole] = useState("");
  const [detail, setDetail] = useState("");
  if (settled && state.message) return <Status state={state} />;
  if (!roles.length) return <p className="text-sm">Add the job in <Link href={SECTIONS.experience.href} className="font-medium text-accent-text underline">Experience</Link> first, then answer this.</p>;
  return <form action={action} aria-label={`Details for requirement ${clarification.requirementIndex + 1}`} className="space-y-2">
    <Hidden analysisId={analysisId} requirementIndex={clarification.requirementIndex} />
    <label className="label" htmlFor={`${id}-role`}>Which role?</label>
    <select id={`${id}-role`} name="experienceId" className="field" required value={role} onChange={e => setRole(e.target.value)}>
      <option value="" disabled>Choose a role</option>
      {roles.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
    </select>
    <label className="label" htmlFor={`${id}-detail`}>What did you do?</label>
    <textarea id={`${id}-detail`} name="detail" rows={3} maxLength={DETAIL_MAX} required className="field" value={detail} onChange={e => setDetail(e.target.value)} />
    <p className="hint">Name it as the requirement does, and say what you worked on, and for whom or how often. {SELF_REPORTED_NOTE}</p>
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save and check again"}</button>
    <Status state={state} />
  </form>;
}

function EntryForm({ analysisId, clarification, settled }: { analysisId: string; clarification: Clarification; settled: boolean }) {
  const id = useId();
  const [state, action, pending] = useActionState(answerWithEntry, {} as ClarificationState);
  const credential = clarification.kind === "credential";
  const [earned, setEarned] = useState("");
  const [qualification, setQualification] = useState("");
  const [issuer, setIssuer] = useState("");
  const [start, setStart] = useState("");
  const [field, setField] = useState("");
  if (settled && state.message) return <Status state={state} />;
  return <form action={action} aria-label={`Details for requirement ${clarification.requirementIndex + 1}`} className="space-y-2">
    <Hidden analysisId={analysisId} requirementIndex={clarification.requirementIndex} />
    <label className="label" htmlFor={`${id}-name`}>{credential ? "Name of the credential" : "Qualification"}</label>
    <input id={`${id}-name`} name="qualification" maxLength={100} required className="field" value={qualification} onChange={e => setQualification(e.target.value)} />
    <label className="label" htmlFor={`${id}-issuer`}>{credential ? "Who issued it?" : "Institution"}</label>
    <input id={`${id}-issuer`} name="institution" maxLength={100} required className="field" value={issuer} onChange={e => setIssuer(e.target.value)} />
    {credential
      ? <input type="hidden" name="startMonth" value={earned} />
      : <>
        <label className="label" htmlFor={`${id}-start`}>Start month</label>
        <input id={`${id}-start`} type="month" name="startMonth" required className="field" value={start} onChange={e => setStart(e.target.value)} />
        <label className="label" htmlFor={`${id}-field`}>Field of study</label>
        <input id={`${id}-field`} name="fieldOfStudy" maxLength={100} className="field" value={field} onChange={e => setField(e.target.value)} />
      </>}
    {credential && <input type="hidden" name="fieldOfStudy" value="" />}
    <input type="hidden" name="description" value="" />
    <label className="label" htmlFor={`${id}-end`}>{credential ? "Month you earned it" : "Month you finished"}</label>
    <input id={`${id}-end`} type="month" name="endMonth" required className="field" value={earned} onChange={e => setEarned(e.target.value)} />
    <p className="hint">{credential ? "Only add a credential you hold now. " : "Only add what you've finished. "}{SELF_REPORTED_NOTE}</p>
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save and check again"}</button>
    <Status state={state} />
  </form>;
}

/** Explains what's uncertain and asks about it. "Yes" only opens a form: it sends nothing and saves nothing.
 * It stays mounted when an answer settles the question (`current` becomes null), so the outcome stays on screen. */
export function ClarificationPanel({ analysisId, current, roles, aiNote }: {
  analysisId: string;
  current: Clarification | null;
  roles: { id: string; label: string }[];
  aiNote: string | null;
}) {
  const [answering, setAnswering] = useState(false);
  const [state, decline, pending] = useActionState(answerNo, {} as ClarificationState);
  const [first] = useState(current);
  const clarification = current ?? first;
  if (!clarification || (!current && !answering && !state.message)) return null;
  const settled = !current;
  if (settled && state.message) return <Status state={state} />;
  const linkOnly = clarification.kind === "employment" || clarification.kind === "skill_level";
  return <section aria-label={`Question about requirement ${clarification.requirementIndex + 1}`} className="space-y-2 rounded-lg border border-l-4 border-l-accent/60 bg-surface-muted p-3 text-sm">
    {clarification.why && <p className="text-muted">{clarification.why}</p>}
    <p className="font-medium">{clarification.question}</p>
    {aiNote && <p className="text-xs text-muted">Local AI also pointed at this. That&apos;s only a suggestion, and it doesn&apos;t affect the result.</p>}
    {settled ? null : linkOnly
      ? <Link href={clarification.kind === "employment" ? SECTIONS.experience.href : SECTIONS.skills.href} className="font-medium text-accent-text underline">{clarification.kind === "employment" ? "Go to Experience" : "Go to Skills"}</Link>
      : !answering && <form action={decline} className="flex flex-wrap items-center gap-2">
        <Hidden analysisId={analysisId} requirementIndex={clarification.requirementIndex} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAnswering(true)}>Yes, add details</button>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>No</button>
      </form>}
    <Status state={state} />
    {answering && (clarification.kind === "work_detail"
      ? <RoleDetailForm analysisId={analysisId} clarification={clarification} roles={roles} settled={settled} />
      : <EntryForm analysisId={analysisId} clarification={clarification} settled={settled} />)}
  </section>;
}

export function TakeBackForm({ clarificationId, label }: { clarificationId: string; label: string }) {
  const [state, action, pending] = useActionState(takeBackAnswer, {} as ClarificationState);
  return <form action={action} className="inline-flex flex-wrap items-center gap-2">
    <input type="hidden" name="clarificationId" value={clarificationId} />
    <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>Remove<span className="sr-only"> {label}</span></button>
    <Status state={state} />
  </form>;
}
