"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppOrigin } from "@/lib/app-origin";

export type RecoveryState = { error?: string; message?: string; complete?: boolean };

export async function requestPasswordReset(
  _previous: RecoveryState, form: FormData,
): Promise<RecoveryState> {
  const raw = form.get("email");
  if (typeof raw !== "string" || raw.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
    return { error: "Enter a valid email address." };
  }
  try {
    const supabase = await createClient();
    // Keep provider responses uniform: an address may be absent, restricted, or rate-limited.
    await supabase.auth.resetPasswordForEmail(raw.trim(), {
      redirectTo: `${getAppOrigin()}/auth/callback?next=/update-password`,
    });
  } catch {
    return { error: "The request could not be completed. Please try again later." };
  }
  return {
    message: "If this address has an account and email delivery is available, you will receive a reset link. Open it in this same browser. If it does not arrive, check spam or try again later.",
  };
}

export async function updatePassword(
  _previous: RecoveryState, form: FormData,
): Promise<RecoveryState> {
  const password = form.get("password");
  const confirmation = form.get("confirmPassword");
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    return { error: "Use a password of 12–128 characters." };
  }
  if (password !== confirmation) return { error: "The passwords do not match." };
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { error: "Your session is no longer valid. Request a new reset link." };
    const result = await supabase.auth.updateUser({ password });
    if (result.error) return { error: "The password could not be updated. Try a different password or request a new link." };
    // Password update has succeeded even if subsequent sign-out fails.
    try {
      const signedOut = await supabase.auth.signOut({ scope: "local" });
      if (signedOut.error) throw new Error("Sign-out failed");
    } catch {
      return { complete: true, message: "Password updated, but automatic sign-out failed. Use Sign out on your dashboard, then sign in with your new password." };
    }
  } catch {
    return { error: "The password could not be updated. Please try again later." };
  }
  // Redirect outside the catch: Next.js implements redirect by throwing.
  redirect("/password-updated");
}
