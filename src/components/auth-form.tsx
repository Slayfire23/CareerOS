"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";
import { AuthShell } from "@/components/auth-shell";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const initialState: AuthState = {};
  const [state, formAction, pending] = useActionState(
    isSignup ? signUp : signIn,
    initialState,
  );

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>

      <form action={formAction} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 12 : 1}
            maxLength={128}
            aria-describedby={isSignup ? "password-hint" : undefined}
            className="field"
          />
          {isSignup && (
            <p id="password-hint" className="mt-2 text-sm">
              Use 12–128 characters.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert">
            {state.error}
          </p>
        )}

        {state.message && (
          <p role="status">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary w-full py-2.5"
        >
          {pending
            ? "Please wait…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      {!isSignup && (
        <p className="text-sm">
          <Link href="/forgot-password" className="underline">Forgot password?</Link>
        </p>
      )}

      <p className="border-t pt-5 text-sm text-muted">
        {isSignup ? "Already have an account? " : "New to CareerOS? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="underline"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </AuthShell>
  );
}
