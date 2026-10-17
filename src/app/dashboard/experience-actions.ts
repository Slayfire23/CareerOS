"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { experienceId, parseExperience } from "@/lib/professional-experience";
export type ExperienceState = { error?: string; message?: string };

export async function saveExperience(_previous: ExperienceState, form: FormData): Promise<ExperienceState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id, data;
  try { id = experienceId(form); data = parseExperience(form); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid experience." }; }
  try {
    if (id) {
      const result = await prisma.professionalExperience.updateMany({ where: { id, profile: { user: { supabaseAuthId: user.id } } }, data });
      if (result.count !== 1) return { error: "Experience not found. Reload and try again." };
    } else {
      const profile = await prisma.careerProfile.findFirst({ where: { user: { supabaseAuthId: user.id } }, select: { id: true } });
      if (!profile) return { error: "Your profile was not found. Please sign in again." };
      await prisma.professionalExperience.create({ data: { profileId: profile.id, ...data } });
    }
  } catch { return { error: "Your experience could not be saved. Please try again." }; }
  revalidatePath("/dashboard");
  return { message: "Experience saved." };
}

export async function removeExperience(_previous: ExperienceState, form: FormData): Promise<ExperienceState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id;
  try { id = experienceId(form); if (!id) throw new Error(); }
  catch { return { error: "Invalid experience selection." }; }
  try {
    const result = await prisma.professionalExperience.deleteMany({ where: { id, profile: { user: { supabaseAuthId: user.id } } } });
    if (result.count !== 1) return { error: "Experience not found. Reload and try again." };
  } catch { return { error: "Your experience could not be removed. Please try again." }; }
  revalidatePath("/dashboard");
  return { message: "Experience removed." };
}
