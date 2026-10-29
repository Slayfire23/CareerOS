"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { educationId, parseEducation } from "@/lib/education";
export type EducationState = { error?: string; message?: string };

export async function saveEducation(_previous: EducationState, form: FormData): Promise<EducationState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id, data;
  try { id = educationId(form); data = parseEducation(form); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid education." }; }
  try {
    if (id) {
      const result = await prisma.education.updateMany({ where: { id, profile: { user: { supabaseAuthId: user.id } } }, data });
      if (result.count !== 1) return { error: "Education not found. Reload and try again." };
    } else {
      const profile = await prisma.careerProfile.findFirst({ where: { user: { supabaseAuthId: user.id } }, select: { id: true } });
      if (!profile) return { error: "Your profile was not found. Please sign in again." };
      await prisma.education.create({ data: { profileId: profile.id, ...data } });
    }
  } catch { return { error: "Your education could not be saved. Please try again." }; }
  revalidatePath("/dashboard", "layout");
  return { message: "Education saved." };
}

export async function removeEducation(_previous: EducationState, form: FormData): Promise<EducationState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id;
  try { id = educationId(form); if (!id) throw new Error(); }
  catch { return { error: "Invalid education selection." }; }
  try {
    const result = await prisma.education.deleteMany({ where: { id, profile: { user: { supabaseAuthId: user.id } } } });
    if (result.count !== 1) return { error: "Education not found. Reload and try again." };
  } catch { return { error: "Your education could not be removed. Please try again." }; }
  revalidatePath("/dashboard", "layout");
  return { message: "Education removed." };
}
