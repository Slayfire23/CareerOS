"use server";
import { revalidatePath } from "next/cache";
import { answerLanguage, LANGUAGE_NOTE } from "@/lib/ai/answer-language";
import { answerPartQuestion, confirmWithDetail, confirmWithEntry, correctAnswer, correctStructuredAnswer, deleteAnswerPermanently, denyQuestion, revokeAnswer, saveStructuredAnswer, skipQuestion, type ReviewResult, type StructuredResult } from "@/lib/ai/clarification-review";
import type { RawSubmission } from "@/lib/ai/rules/structured-form";
import { readAiConfig } from "@/lib/ai/config";
import { parseEducation } from "@/lib/education";
import { createClient } from "@/lib/supabase/server";

export type ReviewState = { error?: string; message?: string };

const EXPIRED = "Your session has expired. Please sign in again.";
const ERRORS: Record<string, string> = {
  disabled: "This isn't available.",
  not_found: "This is no longer available. Reload and try again.",
  not_askable: "This question no longer applies. Run the analysis again.",
  rate_limited: "You've reached today's limit for this. You can still revoke or delete answers.",
  invalid: "Check what you entered and try again.",
  save_failed: "Your answer could not be saved. Please try again.",
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
function reply(result: ReviewResult, saved: string): ReviewState {
  if (!result.ok) return { error: result.message ?? ERRORS[result.error] };
  revalidatePath("/dashboard", "layout");
  return { message: saved };
}

export async function reviewConfirmDetail(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const [analysisId, questionKey, experienceId, detail] = ["analysisId", "questionKey", "experienceId", "detail"].map(k => one(form, k));
  if (!analysisId || !questionKey || !experienceId || detail === null) return { error: "Choose a role and say what you did." };
  return reply(await confirmWithDetail({ supabaseAuthId: user.id, analysisId, questionKey, experienceId, detail, config: readAiConfig() }), answerLanguage(detail) === "en" ? "Saved as self-reported, and checked again." : LANGUAGE_NOTE);
}

export async function reviewConfirmEntry(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  const questionKey = one(form, "questionKey");
  if (!analysisId || !questionKey) return { error: ERRORS.not_found };
  let entry;
  try { entry = parseEducation(form); }
  catch (error) { return { error: error instanceof Error ? error.message : ERRORS.invalid }; }
  return reply(await confirmWithEntry({ supabaseAuthId: user.id, analysisId, questionKey, entry, config: readAiConfig() }), "Saved as self-reported, and checked again.");
}

export async function reviewDeny(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  const questionKey = one(form, "questionKey");
  if (!analysisId || !questionKey) return { error: ERRORS.not_found };
  return reply(await denyQuestion({ supabaseAuthId: user.id, analysisId, questionKey, config: readAiConfig() }), "Saved. You can correct or revoke this below.");
}

export async function reviewSkip(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  const questionKey = one(form, "questionKey");
  if (!analysisId || !questionKey) return { error: ERRORS.not_found };
  const result = await skipQuestion({ supabaseAuthId: user.id, analysisId, questionKey, config: readAiConfig() });
  if (!result.ok) return { error: ERRORS[result.error] };
  revalidatePath("/dashboard", "layout");
  return { message: "Skipped for this job." };
}

export async function reviewCorrect(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  const detail = one(form, "detail");
  if (!clarificationId || detail === null) return { error: ERRORS.invalid };
  return reply(await correctAnswer({ supabaseAuthId: user.id, clarificationId, detail, config: readAiConfig() }), answerLanguage(detail) === "en" ? "Corrected, and checked again." : LANGUAGE_NOTE);
}

export async function reviewRevoke(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  if (!clarificationId) return { error: ERRORS.not_found };
  return reply(await revokeAnswer({ supabaseAuthId: user.id, clarificationId, config: readAiConfig() }), "Revoked. It no longer counts for any job.");
}

export async function reviewDelete(_previous: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  if (!clarificationId) return { error: ERRORS.not_found };
  if (!(await deleteAnswerPermanently({ supabaseAuthId: user.id, clarificationId, config: readAiConfig() }))) return { error: ERRORS.not_found };
  revalidatePath("/dashboard", "layout");
  return { message: "Permanently deleted." };
}

// ---- Phase 5.3 Stage E: structured "your part" answers (behind STRUCTURED_OWNERSHIP_FORM_ENABLED). ----
export type StructuredState = { error?: string; message?: string; fieldErrors?: Partial<Record<string, string>> };
const STRUCTURED_SAVED = "Saved. This kind of answer doesn't change the match yet. You can change, revoke, or delete it below.";
const STRUCTURED_ERRORS: Record<string, string> = {
  ...ERRORS,
  disabled: "This isn't available.",
  already_answered: "You've already answered this. Edit, revoke, or delete that answer below.",
};

function submissionOf(form: FormData): RawSubmission {
  const text = (key: string) => { const v = one(form, key); return v === null ? null : v; };
  return {
    involvement: text("involvement"), alsoDidSome: text("alsoDidSome"), frequency: text("frequency"), recency: text("recency"),
    claimedMonths: text("claimedMonths"), experienceId: text("experienceId"), detail: text("detail"),
    parts: form.getAll("part").filter((v): v is string => typeof v === "string"),
  };
}
function structuredReply(result: StructuredResult, saved: string): StructuredState {
  if (!result.ok) {
    const fieldErrors = Object.fromEntries((result.errors ?? []).map(e => [e.field, e.message]));
    return { error: result.message ?? (result.errors?.length ? "Check the highlighted answers and try again." : STRUCTURED_ERRORS[result.error]), fieldErrors };
  }
  revalidatePath("/dashboard", "layout");
  return { message: saved };
}

export async function reviewSaveStructured(_previous: StructuredState, form: FormData): Promise<StructuredState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  const questionKey = one(form, "questionKey");
  if (!analysisId || !questionKey) return { error: ERRORS.not_found };
  const submission = submissionOf(form);
  const saved = submission.detail && answerLanguage(submission.detail) !== "en" ? `${STRUCTURED_SAVED} ${LANGUAGE_NOTE}` : STRUCTURED_SAVED;
  return structuredReply(await saveStructuredAnswer({ supabaseAuthId: user.id, analysisId, questionKey, submission, config: readAiConfig() }), saved);
}

export async function reviewCorrectStructured(_previous: StructuredState, form: FormData): Promise<StructuredState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  if (!clarificationId) return { error: ERRORS.not_found };
  const partQuestion = one(form, "partQuestion");
  const result = await correctStructuredAnswer({ supabaseAuthId: user.id, clarificationId, submission: submissionOf(form), partQuestion: partQuestion && /^\d$/.test(partQuestion) ? Number(partQuestion) : null, config: readAiConfig() });
  return structuredReply(result, "Changed. This kind of answer doesn't change the match yet.");
}

export async function reviewPartQuestion(_previous: StructuredState, form: FormData): Promise<StructuredState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  const partIndex = one(form, "partIndex");
  const response = one(form, "response");
  if (!clarificationId || !partIndex || !/^\d$/.test(partIndex) || (response !== "no" && response !== "leave")) return { error: ERRORS.invalid };
  const result = await answerPartQuestion({ supabaseAuthId: user.id, clarificationId, partIndex: Number(partIndex), response, config: readAiConfig() });
  return structuredReply(result, response === "no" ? "Updated: that part is no longer ticked." : "Okay, we'll leave it as it is.");
}
