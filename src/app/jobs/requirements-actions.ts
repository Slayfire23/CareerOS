"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { sameDescription, savedJobId } from "@/lib/saved-jobs";
import { parseRequirementReview } from "@/lib/job-requirements";
import { readAiConfig } from "@/lib/ai/config";
import { runJobAnalysis } from "@/lib/ai/analysis";
export type RequirementState = {error?: string; message?: string};
export async function saveRequirements(_previous: RequirementState, form: FormData): Promise<RequirementState> {
 const supabase = await createClient();
 const {data: {user}, error} = await supabase.auth.getUser();
 if (error || !user) return {error: "Your session has expired. Please sign in again."};
 let id, review;
 try {
  id = savedJobId(form); if (!id) throw new Error("Invalid job selection.");
  review = parseRequirementReview(form);
 } catch (error) { return {error: error instanceof Error ? error.message : "Invalid review."}; }
 try {
  // The form's copy of the description may differ from the stored text only in line endings.
  // Match it after normalizing, then record the stored text exactly so review status stays exact.
  const job = await prisma.savedJob.findFirst({where: {id, user: {supabaseAuthId: user.id}}, select: {description: true}});
  if (!job || !sameDescription(job.description, review.description)) return {error: "The job or review changed, or is unavailable. Reload and review again."};
  const result = await prisma.savedJob.updateMany({
   where: {id, user: {supabaseAuthId: user.id}, description: job.description, reviewVersion: review.version},
   data: {requirements: review.requirements, reviewedDescription: job.description, reviewVersion: {increment: 1}}
  });
  if (result.count !== 1) return {error: "The job or review changed, or is unavailable. Reload and review again."};
 } catch { return {error: "Requirements could not be saved. Please try again."}; }
 // V1: the rules-based analysis runs automatically once the requirements are reviewed (deterministic rules, no AI
 // provider; the usual daily limit and run audit apply). If it can't run now, the person runs it from the review page.
 const config = readAiConfig();
 const analysis = config.enabled ? await runJobAnalysis({supabaseAuthId: user.id, jobId: id, provider: "rules", config}).catch(() => null) : null;
 revalidatePath("/dashboard", "layout");
 return {message: analysis?.ok
  ? "Reviewed requirements saved. The rules-based analysis ran: open the analysis to review each result."
  : "Reviewed requirements saved. Run the analysis from the analysis page."};
}
