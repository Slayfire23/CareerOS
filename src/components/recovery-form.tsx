"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type RecoveryState } from "@/app/auth/recovery-actions";

export function RecoveryForm({ mode }: { mode: "request" | "update" }) {
  const updating = mode === "update";
  const [state, action, pending] = useActionState(
    updating ? updatePassword : requestPasswordReset, {} as RecoveryState,
  );
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">{updating ? "Set a new password" : "Reset your password"}</h1>
      {!updating && <p className="text-sm text-muted">Enter your account email. Open the reset link in this same browser.</p>}
      <form action={action} className="space-y-5">
        <fieldset disabled={pending || state.complete} className="space-y-5">
          {updating ? <>
            <div>
              <label htmlFor="new-password" className="label">New password</label>
              <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="field" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="label">Confirm new password</label>
              <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="field" />
            </div>
            <p className="hint">Use 12–128 characters.</p>
          </> : <div>
            <label htmlFor="recovery-email" className="label">Email</label>
            <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} className="field" />
          </div>}
          <button type="submit" className="btn btn-primary">
            {pending ? "Please wait…" : updating ? "Update password" : "Send reset link"}
          </button>
        </fieldset>
        {state.error && <p role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
      </form>
      <p><Link href="/login" className="underline">Back to sign in</Link></p>
      {updating && <p><Link href="/forgot-password" className="underline">Request another reset link</Link></p>}
      {state.complete && <p><Link href="/dashboard" className="underline">Go to dashboard</Link></p>}
    </section>
  );
}
