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
      <h1 className="text-3xl font-bold">{updating ? "Set a new password" : "Reset your password"}</h1>
      {!updating && <p>Enter your account email. Open the reset link in this same browser.</p>}
      <form action={action} className="space-y-5">
        <fieldset disabled={pending || state.complete} className="space-y-5">
          {updating ? <>
            <div>
              <label htmlFor="new-password" className="mb-2 block">New password</label>
              <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="w-full rounded-lg border p-3" />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-2 block">Confirm new password</label>
              <input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} className="w-full rounded-lg border p-3" />
            </div>
            <p className="text-sm">Use 12–128 characters.</p>
          </> : <div>
            <label htmlFor="recovery-email" className="mb-2 block">Email</label>
            <input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} className="w-full rounded-lg border p-3" />
          </div>}
          <button type="submit" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">
            {pending ? "Please wait…" : updating ? "Update password" : "Send reset link"}
          </button>
        </fieldset>
        {state.error && <p role="alert" className="text-red-600 dark:text-red-400">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
      </form>
      <p><Link href="/login" className="underline">Back to sign in</Link></p>
      {updating && <p><Link href="/forgot-password" className="underline">Request another reset link</Link></p>}
      {state.complete && <p><Link href="/dashboard" className="underline">Go to dashboard</Link></p>}
    </section>
  );
}
