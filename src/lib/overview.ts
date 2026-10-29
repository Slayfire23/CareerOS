import "server-only";

import { prisma } from "@/lib/db";

export type RequirementReviewStatus = "not-reviewed" | "reviewed" | "out-of-date";
export type RecentJob = { id: string; title: string; company: string; createdAt: Date; reviewStatus: RequirementReviewStatus; requirementCount: number };

export function requirementReviewStatus(job: { description: string; reviewedDescription: string | null }): RequirementReviewStatus {
  if (job.reviewedDescription === null) return "not-reviewed";
  return job.reviewedDescription === job.description ? "reviewed" : "out-of-date";
}

// Read-only, owner-scoped summary of saved jobs for the dashboard overview.
export async function getSavedJobsOverview(supabaseAuthId: string, take = 3) {
  const where = { user: { supabaseAuthId } };
  const [total, reviewed, recent] = await Promise.all([
    prisma.savedJob.count({ where }),
    // Only reviews that still match the current description count as reviewed.
    prisma.savedJob.count({ where: { ...where, reviewedDescription: { equals: prisma.savedJob.fields.description } } }),
    prisma.savedJob.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, title: true, company: true, createdAt: true, description: true, reviewedDescription: true, requirements: true },
    }),
  ]);
  const jobs: RecentJob[] = recent.map(job => ({
    id: job.id,
    title: job.title,
    company: job.company,
    createdAt: job.createdAt,
    reviewStatus: requirementReviewStatus(job),
    requirementCount: Array.isArray(job.requirements) ? job.requirements.length : 0,
  }));
  return { total, reviewed, jobs };
}
