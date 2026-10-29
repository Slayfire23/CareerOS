import "server-only";

import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export const DEFAULT_DISPLAY_NAME = "My profile";

export async function ensureCurrentUserProfile() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Authentication required.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.user.createMany({
      data: [{ supabaseAuthId: user.id }],
      skipDuplicates: true,
    });

    const careerUser = await tx.user.findUniqueOrThrow({
      where: { supabaseAuthId: user.id },
      select: { id: true },
    });

    await tx.careerProfile.createMany({
      data: [
        {
          userId: careerUser.id,
          displayName: DEFAULT_DISPLAY_NAME,
        },
      ],
      skipDuplicates: true,
    });

    return careerUser.id;
  });
}