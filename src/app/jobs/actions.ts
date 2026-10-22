"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { savedJobId, parseSavedJob } from "@/lib/saved-jobs";
export type JobState = { error?: string; message?: string };

export async function saveJob(_previous: JobState, form: FormData): Promise<JobState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id, data;
  try { id = savedJobId(form); data = parseSavedJob(form); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid job." }; }
  try {
    if (id) {
      const result = await prisma.savedJob.updateMany({ where: { id, user: { supabaseAuthId: user.id } }, data });
      if (result.count !== 1) return { error: "Job not found. Reload and try again." };
    } else {
      const account = await prisma.user.findUnique({ where: { supabaseAuthId: user.id }, select: { id: true } });
      if (!account) return { error: "Your account was not found. Please sign in again." };
      await prisma.savedJob.create({ data: { userId: account.id, ...data } });
    }
  } catch { return { error: "Your job could not be saved. Please try again." }; }
  revalidatePath("/jobs");
  return { message: "Job saved." };
}

export async function removeJob(_previous: JobState, form: FormData): Promise<JobState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id;
  try { id = savedJobId(form); if (!id) throw new Error(); }
  catch { return { error: "Invalid job selection." }; }
  try {
    const result = await prisma.savedJob.deleteMany({ where: { id, user: { supabaseAuthId: user.id } } });
    if (result.count !== 1) return { error: "Job not found. Reload and try again." };
  } catch { return { error: "Your job could not be removed. Please try again." }; }
  revalidatePath("/jobs");
  return { message: "Job removed." };
}
