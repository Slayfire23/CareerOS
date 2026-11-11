"use client";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { reviewConfirmDetail, reviewConfirmEntry, reviewCorrect, reviewDelete, reviewDeny, reviewRevoke, reviewSkip, type ReviewState } from "@/app/jobs/review-actions";
import { DETAIL_MAX } from "@/lib/ai/rules/clarification-limits";
import type { ReviewQuestion } from "@/lib/ai/rules/review-queue";
import { SECTIONS } from "@/lib/sections";

const NOTE = "Saved to your profile as self-reported, in your own words, and used for other jobs too. CareerOS doesn't independently check it, so only add what's accurate. You can edit, revoke, or delete it at any time.";
const Status = ({ state }: { state: ReviewState }) => <>
  {state.error && <p role="alert">{state.error}</p>}
  {state.message && <p role="status">{state.message}</p>}
</>;

function WorkForm({ analysisId, questionKey, roles }: { analysisId: string; questionKey: string; roles: { id: string; label: string }[] }) {
  const id = useId();
  const [state, action, pending] = useActionState(reviewConfirmDetail, {} as ReviewState);
  // Kept here because a form resets after its action, and a turned-away answer shouldn't lose what was typed.
  const [role, setRole] = useState("");
  const [detail, setDetail] = useState("");
  if (!roles.length) return <p className="text-sm">Add the job in <Link href={SECTIONS.experience.href} className="font-medium text-accent-text underline">Experience</Link> first, then answer this.</p>;
  return <form action={action} aria-label="Your answer" className="space-y-2">
    <input type="hidden" name="analysisId" value={analysisId} />
    <input type="hidden" name="questionKey" value={questionKey} />
    <label className="label" htmlFor={`${id}-role`}>Which role?</label>
    <select id={`${id}-role`} name="experienceId" className="field" required value={role} onChange={e => setRole(e.target.value)}>
      <option value="" disabled>Choose a role</option>
      {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
    </select>
    <label className="label" htmlFor={`${id}-detail`}>What did you do?</label>
    <textarea id={`${id}-detail`} name="detail" rows={3} maxLength={DETAIL_MAX} required className="field" value={detail} onChange={e => setDetail(e.target.value)} />
    <p className="hint">Describe the work in your own words: the task, and for whom or how often. {NOTE}</p>
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save and check again"}</button>
    <Status state={state} />
  </form>;
}

function EntryForm({ analysisId, questionKey, credential }: { analysisId: string; questionKey: string; credential: boolean }) {
  const id = useId();
  const [state, action, pending] = useActionState(reviewConfirmEntry, {} as ReviewState);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [field, setField] = useState("");
  return <form action={action} aria-label="Your answer" className="space-y-2">
    <input type="hidden" name="analysisId" value={analysisId} />
    <input type="hidden" name="questionKey" value={questionKey} />
    <label className="label" htmlFor={`${id}-name`}>{credential ? "Name of the credential" : "Qualification"}</label>
    <input id={`${id}-name`} name="qualification" maxLength={100} required className="field" value={name} onChange={e => setName(e.target.value)} />
    <label className="label" htmlFor={`${id}-issuer`}>{credential ? "Who issued it?" : "Institution"}</label>
    <input id={`${id}-issuer`} name="institution" maxLength={100} required className="field" value={issuer} onChange={e => setIssuer(e.target.value)} />
    {credential ? <input type="hidden" name="startMonth" value={end} /> : <>
      <label className="label" htmlFor={`${id}-start`}>Start month</label>
      <input id={`${id}-start`} type="month" name="startMonth" required className="field" value={start} onChange={e => setStart(e.target.value)} />
    </>}
    {credential ? <input type="hidden" name="fieldOfStudy" value="" /> : <>
      <label className="label" htmlFor={`${id}-field`}>Field of study</label>
      <input id={`${id}-field`} name="fieldOfStudy" maxLength={100} className="field" value={field} onChange={e => setField(e.target.value)} />
    </>}
    <input type="hidden" name="description" value="" />
    <label className="label" htmlFor={`${id}-end`}>{credential ? "Month you earned it" : "Month you finished"}</label>
    <input id={`${id}-end`} type="month" name="endMonth" required className="field" value={end} onChange={e => setEnd(e.target.value)} />
    <p className="hint">{credential ? "Only add a credential you hold now. " : "Only add what you've finished. "}{NOTE}</p>
    <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Saving…" : "Save and check again"}</button>
    <Status state={state} />
  </form>;
}

function QuestionCard({ analysisId, question, roles, position }: { analysisId: string; question: ReviewQuestion; roles: { id: string; label: string }[]; position: number }) {
  const [open, setOpen] = useState(false);
  const [denied, deny, denying] = useActionState(reviewDeny, {} as ReviewState);
  const [skipped, skip, skipping] = useActionState(reviewSkip, {} as ReviewState);
  const linkOnly = question.kind === "employment" || question.kind === "skill_level";
  return <li aria-label={`Question ${position}`} className="space-y-2 rounded-lg border border-l-4 border-l-accent/60 bg-surface p-3 text-sm">
    {question.why && <p className="text-muted">{question.why}</p>}
    <p className="font-medium">{question.question}</p>
    {linkOnly
      ? <Link href={question.kind === "employment" ? SECTIONS.experience.href : SECTIONS.skills.href} className="font-medium text-accent-text underline">{question.kind === "employment" ? "Go to Experience" : "Go to Skills"}</Link>
      : <div className="flex flex-wrap items-center gap-2">
        {!open && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Yes, add details</button>}
        <form action={deny}>
          <input type="hidden" name="analysisId" value={analysisId} />
          <input type="hidden" name="questionKey" value={question.key} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={denying}>No, I don&apos;t have this</button>
        </form>
        <form action={skip}>
          <input type="hidden" name="analysisId" value={analysisId} />
          <input type="hidden" name="questionKey" value={question.key} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={skipping}>Skip for now</button>
        </form>
      </div>}
    <Status state={denied} />
    <Status state={skipped} />
    {open && (question.kind === "work_detail"
      ? <WorkForm analysisId={analysisId} questionKey={question.key} roles={roles} />
      : <EntryForm analysisId={analysisId} questionKey={question.key} credential={question.kind === "credential"} />)}
  </li>;
}

export function ReviewQuestions({ analysisId, questions, roles }: { analysisId: string; questions: ReviewQuestion[]; roles: { id: string; label: string }[] }) {
  return <ol className="space-y-3">
    {questions.map((q, i) => <QuestionCard key={q.key} analysisId={analysisId} question={q} roles={roles} position={i + 1} />)}
  </ol>;
}

export function AnswerControls({ clarificationId, detail, label, status }: { clarificationId: string; detail: string | null; label: string; status: string }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(detail ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [corrected, correct, correcting] = useActionState(reviewCorrect, {} as ReviewState);
  const [revoked, revoke, revoking] = useActionState(reviewRevoke, {} as ReviewState);
  const [deleted, remove, removing] = useActionState(reviewDelete, {} as ReviewState);
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      {status === "ACTIVE" && detail !== null && !editing && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>Edit<span className="sr-only"> {label}</span></button>}
      {status === "ACTIVE" && <form action={revoke}>
        <input type="hidden" name="clarificationId" value={clarificationId} />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={revoking}>Revoke<span className="sr-only"> {label}</span></button>
      </form>}
      {confirmDelete
        ? <form action={remove} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="clarificationId" value={clarificationId} />
          <span className="text-sm">This can&apos;t be undone.</span>
          <button type="submit" className="btn btn-danger btn-sm" disabled={removing}>Yes, delete permanently</button>
        </form>
        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(true)}>Delete permanently<span className="sr-only"> {label}</span></button>}
    </div>
    {editing && <form action={correct} aria-label={`Edit ${label}`} className="space-y-2">
      <input type="hidden" name="clarificationId" value={clarificationId} />
      <label className="label" htmlFor={`${id}-edit`}>Your answer</label>
      <textarea id={`${id}-edit`} name="detail" rows={3} maxLength={DETAIL_MAX} className="field" value={text} onChange={e => setText(e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={correcting}>Save correction</button>
    </form>}
    <Status state={corrected} />
    <Status state={revoked} />
    <Status state={deleted} />
  </div>;
}
