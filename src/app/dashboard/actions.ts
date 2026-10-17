"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type ProfileState = {
  error?: string;
  message?: string;
};

export async function saveProfile(
  _previousState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { error: "Your session has expired. Please sign in again." };
  }

  const nameValue = formData.get("displayName");
  const headlineValue = formData.get("headline");
  const goalsValue = formData.get("careerGoals");

  if (
    typeof nameValue !== "string" ||
    typeof headlineValue !== "string" ||
    typeof goalsValue !== "string"
  ) {
    return { error: "Invalid form submission. Please reload the page." };
  }

  const displayName = nameValue.trim();
  const headline = headlineValue.trim();
  const careerGoals = goalsValue.trim();

  if (displayName.length < 1 || displayName.length > 100) {
    return { error: "Display name must contain 1–100 characters." };
  }

  if (headline.length > 200) {
    return { error: "Headline must contain at most 200 characters." };
  }

  if (careerGoals.length > 5000) {
    return { error: "Career goals must contain at most 5,000 characters." };
  }

  try {
    const result = await prisma.careerProfile.updateMany({
      where: {
        user: { supabaseAuthId: user.id },
      },
      data: {
        displayName,
        headline: headline || null,
        careerGoals: careerGoals || null,
      },
    });

    if (result.count !== 1) {
      return {
        error: "Your profile was not found. Please sign out and sign in again.",
      };
    }
  } catch {
    return { error: "Your profile could not be saved. Please try again." };
  }

  revalidatePath("/dashboard");

  return { message: "Profile saved." };
}