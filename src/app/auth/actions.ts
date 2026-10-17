"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCurrentUserProfile } from "@/lib/ensure-profile";
import { getAppOrigin } from "@/lib/app-origin";

export type AuthState = {
  error?: string;
  message?: string;
};

function readCredentials(formData: FormData) {
  const emailValue = formData.get("email");
  const password = formData.get("password");

  if (
    typeof emailValue !== "string" ||
    typeof password !== "string"
  ) {
    return null;
  }

  const email = emailValue.trim();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length === 0 ||
    password.length > 128
  ) {
    return null;
  }

  return { email, password };
}

export async function signUp(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const credentials = readCredentials(formData);

  if (!credentials || credentials.password.length < 12) {
    return {
      error: "Enter a valid email and a password of 12–128 characters.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    ...credentials,
    options: { emailRedirectTo: `${getAppOrigin()}/auth/callback` },
  });

  if (error) {
    return {
      error: "Registration could not be completed. Please try again later.",
    };
  }

  return {
    message:
      "If registration is available for this address, check your email for a confirmation link.",
  };
}

export async function signIn(
  _previousState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const credentials = readCredentials(formData);

  if (!credentials) {
    return { error: "Enter a valid email and password." };
  }

  const supabase = await createClient();
  const { error } =
    await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return {
      error: "Unable to sign in. Check your credentials and confirm your email.",
    };
  }

  try {
    await ensureCurrentUserProfile();
  } catch {
    return {
      error: "You signed in, but profile setup failed. Please try signing in again.",
    };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    return { error: "Unable to sign out. Please try again." };
  }

  redirect("/login");
}
