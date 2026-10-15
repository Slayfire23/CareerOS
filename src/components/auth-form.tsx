"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const initialState: AuthState = {};
  const [state, formAction, pending] = useActionState(
    isSignup ? signUp : signIn,
    initialState,
  );

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <p className="mb-2 text-sm font-semibold">CareerOS</p>
      <h1 className="mb-8 text-3xl font-bold">
        {isSignup ? "Create your account" : "Welcome back"}
      </h1>

      <form action={formAction} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className="w-full rounded-lg border p-3"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block">
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
            className="w-full rounded-lg border p-3"
          />
          {isSignup && (
            <p id="password-hint" className="mt-2 text-sm">
              Use 12–128 characters.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        {state.message && (
          <p role="status" className="text-green-700 dark:text-green-400">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {pending
            ? "Please wait…"
            : isSignup
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm">
        {isSignup ? "Already have an account? " : "New to CareerOS? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="underline"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}