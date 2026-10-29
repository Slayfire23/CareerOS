"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { parseTechnicalSkill } from "@/lib/technical-skills";

export type SkillState = { error?: string; message?: string };

export async function saveTechnicalSkill(_previous: SkillState, form: FormData): Promise<SkillState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let data;
  try { data = parseTechnicalSkill(form); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid skill." }; }
  try {
    const profile = await prisma.careerProfile.findFirst({ where: { user: { supabaseAuthId: user.id } }, select: { id: true } });
    if (!profile) return { error: "Your profile was not found. Please sign out and sign in again." };
    await prisma.technicalSkill.upsert({
      where: { profileId_normalizedName: { profileId: profile.id, normalizedName: data.normalizedName } },
      create: { profileId: profile.id, ...data }, update: data,
    });
  } catch { return { error: "Your skill could not be saved. Please try again." }; }
  revalidatePath("/dashboard", "layout");
  return { message: "Skill saved." };
}

export async function removeTechnicalSkill(_previous: SkillState, form: FormData): Promise<SkillState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  const ids = form.getAll("skillId");
  if (ids.length !== 1 || typeof ids[0] !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ids[0])) {
    return { error: "Invalid skill selection. Reload the page and try again." };
  }
  try {
    const result = await prisma.technicalSkill.deleteMany({ where: { id: ids[0], profile: { user: { supabaseAuthId: user.id } } } });
    if (result.count !== 1) return { error: "The skill could not be removed. Reload the page and try again." };
  } catch { return { error: "The skill could not be removed. Please try again." }; }
  revalidatePath("/dashboard", "layout");
  return { message: "Skill removed." };
}
