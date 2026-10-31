"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readAiConfig } from "@/lib/ai/config";
import { NOTE_MAX, runJobAnalysis, saveAnalysisFeedback, type RunErrorCode } from "@/lib/ai/analysis";
import { savedJobId } from "@/lib/saved-jobs";

export type MatchRunState = { error?: string; message?: string };
export type FeedbackState = { error?: string; message?: string; version?: number };

const RUN_MESSAGES: Record<RunErrorCode, string> = {
  not_configured: "Requirement analysis is not available right now.",
  not_found: "This job is unavailable.",
  not_reviewed: "Review and save this job's requirements first.",
  out_of_date: "The job description changed. Review the requirements again first.",
  no_requirements: "Save at least one reviewed requirement first.",
  profile_missing: "Your profile is missing. Sign out and back in to finish setting it up.",
  profile_too_large: "Your profile has too many entries to analyze at once (200 maximum).",
  consent_required: "This analysis needs your consent before using a cloud AI provider.",
  rate_limited: "You've reached today's analysis limit. Try again later.",
  service_unavailable: "The analysis service is unavailable. Your saved requirements are unaffected; try again later.",
  service_timeout: "The analysis took too long. Please try again.",
  service_rejected: "The analysis service rejected the request. Please try again.",
  provider_timeout: "The analysis took too long. Please try again.",
  provider_output_rejected: "The analysis could not be verified and was discarded.",
  invalid_response: "The analysis service returned an unreadable response.",
  response_rejected: "The analysis could not be verified and was discarded.",
};

async function signedInUserId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : user.id;
}

export async function runJobMatch(_previous: MatchRunState, form: FormData): Promise<MatchRunState> {
  const supabaseAuthId = await signedInUserId();
  if (!supabaseAuthId) return { error: "Your session has expired. Please sign in again." };
  let jobId: string;
  try {
    jobId = savedJobId(form);
    if (!jobId) throw new Error();
  } catch {
    return { error: "Invalid job selection." };
  }
  const result = await runJobAnalysis({ supabaseAuthId, jobId, config: readAiConfig() });
  if (!result.ok) return { error: RUN_MESSAGES[result.error] };
  revalidatePath("/dashboard", "layout");
  return { message: "Analysis complete." };
}

export async function saveMatchFeedback(_previous: FeedbackState, form: FormData): Promise<FeedbackState> {
  const supabaseAuthId = await signedInUserId();
  if (!supabaseAuthId) return { error: "Your session has expired. Please sign in again." };
  const one = (key: string) => {
    const values = form.getAll(key);
    return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
  };
  const analysisId = one("analysisId");
  const version = Number(one("version"));
  const index = Number(one("requirementIndex"));
  const choice = one("choice");
  const note = one("note");
  if (
    !analysisId ||
    !Number.isSafeInteger(version) || version < 0 ||
    !Number.isSafeInteger(index) || index < 0 ||
    (choice !== "agree" && choice !== "disagree" && choice !== "clear") ||
    note === null || note.length > NOTE_MAX
  ) {
    return { error: `Choose Agree or Disagree. Notes can be up to ${NOTE_MAX} characters.` };
  }
  const result = await saveAnalysisFeedback({ supabaseAuthId, analysisId, version, requirementIndex: index, choice, note });
  if (!result.ok) {
    return { error: result.error === "conflict" ? "This analysis changed in another tab. Reload and try again." : "Feedback could not be saved." };
  }
  revalidatePath("/dashboard", "layout");
  return { message: choice === "clear" ? "Feedback cleared." : "Feedback saved.", version: result.version };
}
