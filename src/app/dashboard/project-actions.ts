"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { projectId, parseProject } from "@/lib/projects";
export type ProjectState = { error?: string; message?: string };

export async function saveProject(_previous: ProjectState, form: FormData): Promise<ProjectState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id, data;
  try { id = projectId(form); data = parseProject(form); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid project." }; }
  try {
    if (id) {
      const result = await prisma.projectAccomplishment.updateMany({ where: { id, profile: { user: { supabaseAuthId: user.id } } }, data });
      if (result.count !== 1) return { error: "Project not found. Reload and try again." };
    } else {
      const profile = await prisma.careerProfile.findFirst({ where: { user: { supabaseAuthId: user.id } }, select: { id: true } });
      if (!profile) return { error: "Your profile was not found. Please sign in again." };
      await prisma.projectAccomplishment.create({ data: { profileId: profile.id, ...data } });
    }
  } catch { return { error: "Your project could not be saved. Please try again." }; }
  revalidatePath("/dashboard");
  return { message: "Project saved." };
}

export async function removeProject(_previous: ProjectState, form: FormData): Promise<ProjectState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let id;
  try { id = projectId(form); if (!id) throw new Error(); }
  catch { return { error: "Invalid project selection." }; }
  try {
    const result = await prisma.projectAccomplishment.deleteMany({ where: { id, profile: { user: { supabaseAuthId: user.id } } } });
    if (result.count !== 1) return { error: "Project not found. Reload and try again." };
  } catch { return { error: "Your project could not be removed. Please try again." }; }
  revalidatePath("/dashboard");
  return { message: "Project removed." };
}
