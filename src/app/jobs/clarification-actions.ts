"use server";
import { revalidatePath } from "next/cache";
import { answerLanguage, LANGUAGE_NOTE } from "@/lib/ai/answer-language";
import { addEducationEntry, addRoleDetail, declineClarification, editRoleDetail, removeClarification, type ClarificationResult } from "@/lib/ai/clarification-store";
import { readAiConfig } from "@/lib/ai/config";
import type { Verdict } from "@/lib/ai/evidence";
import { parseEducation } from "@/lib/education";
import { createClient } from "@/lib/supabase/server";

export type ClarificationState = { error?: string; message?: string };

const EXPIRED = "Your session has expired. Please sign in again.";
const VERDICT_WORDS: Record<Verdict, string> = { supported: "Supported — Self-reported", possible: "Possible", gap: "Not supported", insufficient_information: "Not enough information" };
const ERRORS: Record<string, string> = {
  not_found: "This is no longer available. Reload and try again.",
  not_askable: "This question no longer applies. Run the analysis again.",
  rate_limited: "You've added a lot of answers today. Try again tomorrow.",
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

function reply(result: ClarificationResult): ClarificationState {
  if (!result.ok) return { error: result.message ?? ERRORS[result.error] };
  revalidatePath("/dashboard", "layout");
  if (result.after === null) return { message: "Saved to your profile as self-reported. Run the analysis again to see what it changes." };
  if (result.after === result.before) {
    return { message: `Saved to your profile as self-reported. The result stays ${VERDICT_WORDS[result.after]}: the rules look for the requirement's own words alongside what you did. You can remove this answer below.` };
  }
  return { message: `Saved to your profile as self-reported. The rules now read this as ${VERDICT_WORDS[result.after]}.` };
}

export async function answerWithRoleDetail(_previous: ClarificationState, form: FormData): Promise<ClarificationState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  const experienceId = one(form, "experienceId");
  const detail = one(form, "detail");
  if (!analysisId || !experienceId || detail === null) return { error: "Choose a role and say what you did." };
  const state = reply(await addRoleDetail({ supabaseAuthId: user.id, analysisId, requirementIndex: Number(one(form, "requirementIndex")), experienceId, detail, config: readAiConfig() }));
  return state.message && answerLanguage(detail) !== "en" ? { message: LANGUAGE_NOTE } : state;
}

export async function editAnswer(_previous: ClarificationState, form: FormData): Promise<ClarificationState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  const detail = one(form, "detail");
  if (!clarificationId || detail === null) return { error: ERRORS.not_found };
  const state = reply(await editRoleDetail({ supabaseAuthId: user.id, clarificationId, detail, config: readAiConfig() }));
  return state.message && answerLanguage(detail) !== "en" ? { message: LANGUAGE_NOTE } : state;
}

export async function answerWithEntry(_previous: ClarificationState, form: FormData): Promise<ClarificationState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  if (!analysisId) return { error: ERRORS.not_found };
  let entry;
  try { entry = parseEducation(form); }
  catch (error) { return { error: error instanceof Error ? error.message : ERRORS.invalid }; }
  return reply(await addEducationEntry({ supabaseAuthId: user.id, analysisId, requirementIndex: Number(one(form, "requirementIndex")), entry, config: readAiConfig() }));
}

export async function answerNo(_previous: ClarificationState, form: FormData): Promise<ClarificationState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const analysisId = one(form, "analysisId");
  if (!analysisId) return { error: ERRORS.not_found };
  const result = await declineClarification({ supabaseAuthId: user.id, analysisId, requirementIndex: Number(one(form, "requirementIndex")) });
  if (!result.ok) return { error: ERRORS[result.error] };
  revalidatePath("/dashboard", "layout");
  return { message: "Noted. This won't be asked again for this job, and nothing else changes." };
}

export async function takeBackAnswer(_previous: ClarificationState, form: FormData): Promise<ClarificationState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const clarificationId = one(form, "clarificationId");
  if (!clarificationId || !(await removeClarification({ supabaseAuthId: user.id, clarificationId }))) return { error: ERRORS.not_found };
  revalidatePath("/dashboard", "layout");
  return { message: "Answer deleted. Run the analysis again to update the results." };
}
