"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { parseSalaryExpectations } from "@/lib/salary-expectations";

export type SalaryState = { error?: string; message?: string };

export async function saveSalaryExpectations(
  _previous: SalaryState, form: FormData,
): Promise<SalaryState> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Your session has expired. Please sign in again." };
  let data;
  try {
    data = parseSalaryExpectations(form);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid preferences." };
  }
  try {
    const result = await prisma.careerProfile.updateMany({
      where: { user: { supabaseAuthId: user.id } }, data,
    });
    if (result.count !== 1) return { error: "Your profile was not found. Please sign out and sign in again." };
  } catch {
    return { error: "Your preferences could not be saved. Please try again." };
  }
  revalidatePath("/dashboard");
  return { message: "Salary expectations saved." };
}
