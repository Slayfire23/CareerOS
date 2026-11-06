"use client";
import { useActionState, useId, useState } from "react";
import { followUpDelete, followUpDeny, followUpReply, followUpRevoke, followUpSkip, type FollowUpState } from "@/app/jobs/follow-up-actions";
import { DETAIL_MAX } from "@/lib/ai/rules/clarification-limits";

export type FollowUpView = { id: string; status: string; question: string; requirementText: string; detail: string | null; note: string | null };

const Status = ({ state }: { state: FollowUpState }) => <>
  {state.error && <p role="alert">{state.error}</p>}
  {state.message && <p role="status">{state.message}</p>}
</>;
const Hidden = ({ id }: { id: string }) => <input type="hidden" name="followUpId" value={id} />;

function ReplyForm({ followUp, label, button }: { followUp: FollowUpView; label: string; button: string }) {
  const id = useId();
  const [state, action, pending] = useActionState(followUpReply, {} as FollowUpState);
  // Kept here because a form resets after its action, and a turned-away reply shouldn't lose what was typed.
  const [text, setText] = useState(followUp.detail ?? "");
  return <form action={action} aria-label={label} className="space-y-2">
    <Hidden id={followUp.id} />
    <label className="label" htmlFor={`${id}-detail`}>What did you personally do?</label>
    <textarea id={`${id}-detail`} name="detail" rows={3} maxLength={DETAIL_MAX} required className="field" value={text} onChange={e => setText(e.target.value)} />
    <p className="hint">Self-reported, in your own words. CareerOS doesn&apos;t independently check it, and it can reach Possible at most. You can edit, revoke, or delete it at any time.</p>
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : button}</button>
    <Status state={state} />
  </form>;
}

function OpenCard({ followUp }: { followUp: FollowUpView }) {
  const [open, setOpen] = useState(false);
  const [denied, deny, denying] = useActionState(followUpDeny, {} as FollowUpState);
  const [skipped, skip, skipping] = useActionState(followUpSkip, {} as FollowUpState);
  return <li aria-label={`Follow-up about ${followUp.requirementText}`} className="space-y-2 rounded-lg border border-l-4 border-l-accent/60 bg-surface p-3 text-sm">
    <p className="font-medium">{followUp.question}</p>
    <p className="text-xs text-muted">Suggested by a local model reading your answer. Its suggestion doesn&apos;t change any result.</p>
    <div className="flex flex-wrap items-center gap-2">
      {!open && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Answer</button>}
      <form action={deny}><Hidden id={followUp.id} /><button type="submit" className="btn btn-secondary btn-sm" disabled={denying}>No, this is different work</button></form>
      <form action={skip}><Hidden id={followUp.id} /><button type="submit" className="btn btn-secondary btn-sm" disabled={skipping}>Skip</button></form>
    </div>
    <Status state={denied} />
    <Status state={skipped} />
    {open && <ReplyForm followUp={followUp} label="Your reply" button="Save and check again" />}
  </li>;
}

function ReplyCard({ followUp }: { followUp: FollowUpView }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revoked, revoke, revoking] = useActionState(followUpRevoke, {} as FollowUpState);
  const [deleted, remove, removing] = useActionState(followUpDelete, {} as FollowUpState);
  const label = `reply about ${followUp.requirementText}`;
  return <li className="space-y-1 py-2 text-sm">
    <p className="text-xs font-medium text-muted">{followUp.requirementText}{followUp.status === "REVOKED" ? " · Revoked, no longer counts" : ""}</p>
    {followUp.detail && <p className="break-words">{followUp.detail}</p>}
    {followUp.note && followUp.status === "ANSWERED" && <p className="text-xs text-muted">{followUp.note}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {followUp.status === "ANSWERED" && !editing && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit<span className="sr-only"> {label}</span></button>}
      {followUp.status === "ANSWERED" && <form action={revoke}><Hidden id={followUp.id} /><button type="submit" className="btn btn-secondary btn-sm" disabled={revoking}>Revoke<span className="sr-only"> {label}</span></button></form>}
      {followUp.detail && (confirmDelete
        ? <form action={remove} className="flex flex-wrap items-center gap-2"><Hidden id={followUp.id} /><span>This can&apos;t be undone.</span><button type="submit" className="btn btn-danger btn-sm" disabled={removing}>Yes, delete this reply</button></form>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(true)}>Delete permanently<span className="sr-only"> {label}</span></button>)}
    </div>
    {editing && <ReplyForm followUp={followUp} label={`Edit ${label}`} button="Save correction" />}
    <Status state={revoked} />
    <Status state={deleted} />
  </li>;
}

export function FollowUps({ followUps, unavailable }: { followUps: FollowUpView[]; unavailable: boolean }) {
  const open = followUps.filter(f => f.status === "PROPOSED");
  const replied = followUps.filter(f => (f.status === "ANSWERED" || f.status === "REVOKED") && f.detail);
  return <div className="space-y-2">
    {unavailable && <p className="text-sm text-muted">CareerOS couldn&apos;t look for related work in your answer just now, so it stays unresolved. Nothing was assumed. You can edit your answer at any time.</p>}
    {open.length > 0 && <div className="space-y-2">
      <h4 className="text-sm font-semibold">A question about your answer</h4>
      <ul className="space-y-3">{open.map(f => <OpenCard key={f.id} followUp={f} />)}</ul>
    </div>}
    {replied.length > 0 && <div className="space-y-1">
      <h4 className="text-sm font-semibold">Your replies</h4>
      <ul className="divide-y">{replied.map(f => <ReplyCard key={f.id} followUp={f} />)}</ul>
    </div>}
  </div>;
}
