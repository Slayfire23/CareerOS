"use server";
import { revalidatePath } from "next/cache";
import { recheckAfterAnswer } from "@/lib/ai/clarification-review";
import { readAiConfig } from "@/lib/ai/config";
import { closeFollowUp, deleteFollowUpReply, replyToFollowUp, revokeFollowUp, type FollowUpResult } from "@/lib/ai/follow-up";
import { createClient } from "@/lib/supabase/server";

export type FollowUpState = { error?: string; message?: string };

const EXPIRED = "Your session has expired. Please sign in again.";
const ERRORS: Record<string, string> = {
  not_found: "This is no longer available. Reload and try again.",
  rate_limited: "You've reached today's limit for this. You can still revoke or delete a reply.",
  invalid: "Check what you entered and try again.",
  save_failed: "Your reply could not be saved. Please try again.",
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
function reply(result: FollowUpResult): FollowUpState {
  if (!result.ok) return { error: result.message ?? ERRORS[result.error] };
  revalidatePath("/dashboard", "layout");
  return { message: result.note };
}

export async function followUpReply(_previous: FollowUpState, form: FormData): Promise<FollowUpState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const followUpId = one(form, "followUpId");
  const detail = one(form, "detail");
  if (!followUpId || detail === null) return { error: ERRORS.not_found };
  return reply(await replyToFollowUp({ supabaseAuthId: user.id, followUpId, detail, config: readAiConfig(), recheck: recheckAfterAnswer }));
}

export async function followUpDeny(_previous: FollowUpState, form: FormData): Promise<FollowUpState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const followUpId = one(form, "followUpId");
  if (!followUpId) return { error: ERRORS.not_found };
  return reply(await closeFollowUp({ supabaseAuthId: user.id, followUpId, action: "deny", config: readAiConfig(), recheck: recheckAfterAnswer }));
}

export async function followUpSkip(_previous: FollowUpState, form: FormData): Promise<FollowUpState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const followUpId = one(form, "followUpId");
  if (!followUpId) return { error: ERRORS.not_found };
  return reply(await closeFollowUp({ supabaseAuthId: user.id, followUpId, action: "skip", config: readAiConfig(), recheck: recheckAfterAnswer }));
}

export async function followUpRevoke(_previous: FollowUpState, form: FormData): Promise<FollowUpState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const followUpId = one(form, "followUpId");
  if (!followUpId) return { error: ERRORS.not_found };
  return reply(await revokeFollowUp({ supabaseAuthId: user.id, followUpId, config: readAiConfig(), recheck: recheckAfterAnswer }));
}

export async function followUpDelete(_previous: FollowUpState, form: FormData): Promise<FollowUpState> {
  const user = await signedInUser();
  if (!user) return { error: EXPIRED };
  const followUpId = one(form, "followUpId");
  if (!followUpId || !(await deleteFollowUpReply({ supabaseAuthId: user.id, followUpId, config: readAiConfig() }))) return { error: ERRORS.not_found };
  revalidatePath("/dashboard", "layout");
  return { message: "Permanently deleted." };
}
