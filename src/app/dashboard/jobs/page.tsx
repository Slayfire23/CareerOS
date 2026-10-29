import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { requirementReviewStatus } from "@/lib/overview";
import { SavedJobs } from "@/components/saved-jobs";
import { LoadingBlock, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Saved jobs" };

async function JobsContent() {
 await connection();
 const supabase = await createClient();
 const { data: { user }, error } = await supabase.auth.getUser();
 if (error || !user) redirect("/login");
 const jobs = await prisma.savedJob.findMany({ where: { user: { supabaseAuthId: user.id } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true, company: true, postingUrl: true, description: true, createdAt: true, reviewedDescription: true } });
 return <SavedJobs jobs={jobs.map(({ reviewedDescription, ...job }) => ({ ...job, reviewStatus: requirementReviewStatus({ description: job.description, reviewedDescription }) }))} />;
}
export default function JobsPage() {
 return <div className="space-y-8">
  <PageHeader title="Saved jobs" description="Postings you are considering. Review each one's requirements against its own text." />
  <Suspense fallback={<LoadingBlock variant="list" label="Loading your jobs…" />}><JobsContent /></Suspense>
 </div>;
}
