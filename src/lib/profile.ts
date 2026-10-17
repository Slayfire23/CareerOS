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
      targetRoles: true,
      industries: true,
      workArrangements: true,
      employmentTypes: true, preferredLocations: true, relocationWillingness: true, maxCommuteMinutes: true, salaryMinCents: true, salaryMaxCents: true, salaryCurrency: true, salaryPeriod: true,
      educationEntries: { select: { id: true, qualification: true, institution: true, fieldOfStudy: true, startMonth: true, endMonth: true, description: true }, orderBy: [{ startMonth: "desc" }, { id: "asc" }] }, professionalExperiences: { select: { id: true, jobTitle: true, company: true, startMonth: true, endMonth: true, description: true }, orderBy: [{ startMonth: "desc" }, { id: "asc" }] }, technicalSkills: { select: { id: true, name: true, proficiency: true }, orderBy: { normalizedName: "asc" } },
    },
  });
}
