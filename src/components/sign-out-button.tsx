"use client";

import { useActionState } from "react";
import { signOut, type AuthState } from "@/app/auth/actions";

export function SignOutButton() {
  const initialState: AuthState = {};
  const [state, formAction, pending] = useActionState(
    signOut,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border px-4 py-2 disabled:opacity-50"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>

      {state.error && (
        <p role="alert" className="text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}