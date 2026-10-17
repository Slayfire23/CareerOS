import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return prisma.careerProfile.findFirst({
    where: {
      user: { supabaseAuthId: user.id },
    },
    select: {
      displayName: true,
      headline: true,
      careerGoals: true,
    },
  });
}