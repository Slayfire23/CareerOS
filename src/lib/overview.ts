import "server-only";

import { prisma } from "@/lib/db";

export type RequirementReviewStatus = "not-reviewed" | "reviewed" | "out-of-date";
export type RecentJob = { id: string; title: string; company: string; createdAt: Date; reviewStatus: RequirementReviewStatus; requirementCount: number; priorityCounts: Record<"Required" | "Preferred" | "Unspecified", number> };

export function requirementReviewStatus(job: { description: string; reviewedDescription: string | null }): RequirementReviewStatus {
  if (job.reviewedDescription === null) return "not-reviewed";
  return job.reviewedDescription === job.description ? "reviewed" : "out-of-date";
}

// Read-only, owner-scoped summary of saved jobs for the dashboard overview.
// Omit take to list every saved job.
export async function getSavedJobsOverview(supabaseAuthId: string, take?: number) {
  const where = { user: { supabaseAuthId } };
  const [total, reviewed, notReviewed, recent] = await Promise.all([
    prisma.savedJob.count({ where }),
    // Only reviews that still match the current description count as reviewed.
    prisma.savedJob.count({ where: { ...where, reviewedDescription: { equals: prisma.savedJob.fields.description } } }),
    prisma.savedJob.count({ where: { ...where, reviewedDescription: null } }),
    prisma.savedJob.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, title: true, company: true, createdAt: true, description: true, reviewedDescription: true, requirements: true },
    }),
  ]);
  const jobs: RecentJob[] = recent.map(job => {
    const rows = Array.isArray(job.requirements) ? job.requirements : [];
    const priorityCounts = { Required: 0, Preferred: 0, Unspecified: 0 };
    for (const row of rows) {
      const priority = row && typeof row === "object" && "priority" in row ? row.priority : null;
      if (priority === "Required" || priority === "Preferred" || priority === "Unspecified") priorityCounts[priority]++;
    }
    return {
      id: job.id,
      title: job.title,
      company: job.company,
      createdAt: job.createdAt,
      reviewStatus: requirementReviewStatus(job),
      requirementCount: rows.length,
      priorityCounts,
    };
  });
  return { total, reviewed, notReviewed, outOfDate: total - reviewed - notReviewed, jobs };
}
