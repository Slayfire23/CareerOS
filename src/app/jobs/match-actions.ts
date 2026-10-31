"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { readAiConfig } from "@/lib/ai/config";
import { NOTE_MAX, runJobAnalysis, saveAnalysisFeedback, setCloudAiConsent, type RunErrorCode } from "@/lib/ai/analysis";
import { savedJobId } from "@/lib/saved-jobs";

export type MatchRunState = { error?: string; message?: string };
export type FeedbackState = { error?: string; message?: string; version?: number };
export type ConsentState = { error?: string; message?: string };

const UNAVAILABLE = "The analysis service is unavailable. Your saved requirements are unaffected; try again later.";
const PROVIDER_DOWN = "The AI provider is not available right now. The rules engine still works; try again later.";
const DISCARDED = "The analysis could not be verified and was discarded.";

const RUN_MESSAGES: Record<RunErrorCode, string> = {
  not_configured: "Requirement analysis is not available right now.",
  not_found: "This job is unavailable.",
  not_reviewed: "Review and save this job's requirements first.",
  out_of_date: "The job description changed. Review the requirements again first.",
  no_requirements: "Save at least one reviewed requirement first.",
  profile_missing: "Your profile is missing. Sign out and back in to finish setting it up.",
  profile_too_large: "Your profile has too many entries to analyze at once (200 maximum).",
  too_large_for_cloud: "Your profile and requirements are too long for a cloud analysis. Use the rules engine instead.",
  cloud_unavailable: "Cloud analysis isn't available for your account. Use the rules engine instead.",
  consent_required: "Give consent below before using cloud analysis.",
  rate_limited: "You've reached today's analysis limit. Try again later.",
  attempts_exceeded: "Too many analysis attempts today. Try again later.",
  user_budget_exceeded: "You've reached today's cloud analysis budget. The rules engine still works.",
  budget_exceeded: "Cloud analysis has reached its spending limit for now. The rules engine still works.",
  service_unavailable: UNAVAILABLE,
  replay_store_unavailable: UNAVAILABLE,
  service_timeout: "The analysis took too long. Please try again.",
  service_rejected: "The analysis service rejected the request. Please try again.",
  provider_timeout: "The analysis took too long. Please try again.",
  provider_busy: "The AI provider is busy. Try again in a few minutes.",
  provider_unavailable: PROVIDER_DOWN,
  provider_request_rejected: PROVIDER_DOWN,
  provider_error: PROVIDER_DOWN,
  provider_refused: "This analysis couldn't be completed by the AI provider. The rules engine still works.",
  provider_output_truncated: DISCARDED,
  provider_output_rejected: DISCARDED,
  over_budget: "This analysis is too large for its budget. Use the rules engine instead.",
  invalid_response: "The analysis service returned an unreadable response.",
  response_rejected: DISCARDED,
};

async function signedInUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : user;
}

function one(form: FormData, key: string) {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

export async function runJobMatch(_previous: MatchRunState, form: FormData): Promise<MatchRunState> {
  const user = await signedInUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  let jobId: string;
  try {
    jobId = savedJobId(form);
    if (!jobId) throw new Error();
  } catch {
    return { error: "Invalid job selection." };
  }
  const provider = one(form, "provider") ?? "rules";
  if (provider !== "rules" && provider !== "anthropic") return { error: "Choose an analysis method." };
  const result = await runJobAnalysis({ supabaseAuthId: user.id, jobId, provider, contactEmail: user.email ?? null, config: readAiConfig() });
  if (!result.ok) return { error: RUN_MESSAGES[result.error] };
  revalidatePath("/dashboard", "layout");
  return { message: "Analysis complete." };
}

export async function setCloudConsent(_previous: ConsentState, form: FormData): Promise<ConsentState> {
  const user = await signedInUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  const choice = one(form, "choice");
  if (choice !== "grant" && choice !== "withdraw") return { error: "Choose to give or withdraw consent." };
  if (choice === "grant" && one(form, "understood") !== "on") return { error: "Confirm that you've read what is sent." };
  if (!(await setCloudAiConsent(user.id, choice === "grant"))) return { error: "Consent could not be saved." };
  revalidatePath("/dashboard", "layout");
  return { message: choice === "grant" ? "Consent saved." : "Consent withdrawn. Nothing more will be sent to the cloud provider." };
}

export async function saveMatchFeedback(_previous: FeedbackState, form: FormData): Promise<FeedbackState> {
  const user = await signedInUser();
  if (!user) return { error: "Your session has expired. Please sign in again." };
  const analysisId = one(form, "analysisId");
  const version = Number(one(form, "version"));
  const index = Number(one(form, "requirementIndex"));
  const choice = one(form, "choice");
  const note = one(form, "note");
  if (
    !analysisId ||
    !Number.isSafeInteger(version) || version < 0 ||
    !Number.isSafeInteger(index) || index < 0 ||
    (choice !== "agree" && choice !== "disagree" && choice !== "clear") ||
    note === null || note.length > NOTE_MAX
  ) {
    return { error: `Choose Agree or Disagree. Notes can be up to ${NOTE_MAX} characters.` };
  }
  const result = await saveAnalysisFeedback({ supabaseAuthId: user.id, analysisId, version, requirementIndex: index, choice, note });
  if (!result.ok) {
    return { error: result.error === "conflict" ? "This analysis changed in another tab. Reload and try again." : "Feedback could not be saved." };
  }
  revalidatePath("/dashboard", "layout");
  return { message: choice === "clear" ? "Feedback cleared." : "Feedback saved.", version: result.version };
}
