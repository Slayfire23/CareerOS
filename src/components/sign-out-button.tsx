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
    <form action={formAction} className="space-y-2">
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>

      {state.error && (
        <p role="alert" className="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}