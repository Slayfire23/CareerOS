"use client";
import { useEffect, useRef, useState } from "react";

// Two-step destructive button. The first click asks for confirmation inline; only the
// confirmation button submits the surrounding form. Escape or Cancel backs out.
export function ConfirmButton({ label, ariaLabel, confirmLabel, pending, pendingLabel }: { label: string; ariaLabel: string; confirmLabel: string; pending: boolean; pendingLabel: string }) {
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
    else if (returnFocus.current) { triggerRef.current?.focus(); returnFocus.current = false; }
  }, [asking]);
  const cancel = () => { returnFocus.current = true; setAsking(false); };
  if (!asking && !pending) return <button ref={triggerRef} type="button" className="btn btn-danger btn-sm" aria-label={ariaLabel} onClick={() => setAsking(true)}>{label}</button>;
  return <span role="group" aria-label={`Confirm: ${ariaLabel}`} className="inline-flex flex-wrap items-center gap-2" onKeyDown={event => { if (event.key === "Escape" && !pending) cancel(); }}>
    <span className="text-sm text-muted">Are you sure?</span>
    <button ref={confirmRef} type="submit" className="btn btn-danger btn-sm border-danger-text" disabled={pending} aria-label={`Yes, ${ariaLabel.charAt(0).toLowerCase()}${ariaLabel.slice(1)}`}>{pending ? pendingLabel : `Yes, ${confirmLabel}`}</button>
    {!pending && <button type="button" className="btn btn-secondary btn-sm" onClick={cancel}>Cancel</button>}
  </span>;
}
