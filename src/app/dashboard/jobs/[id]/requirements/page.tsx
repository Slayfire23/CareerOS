import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { suggestRequirements, validateRequirements } from "@/lib/job-requirements";
import { SECTIONS } from "@/lib/sections";
import { JobRequirementsReview } from "@/components/job-requirements-review";
import { Card, LoadingBlock, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Review job requirements" };
async function ReviewContent({params}: {params: Promise<{id: string}>}) {
 await connection();
 const supabase = await createClient();
 const {data: {user}, error} = await supabase.auth.getUser();
 if (error || !user) redirect("/login");
 const {id} = await params;
 if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound();
 const job = await prisma.savedJob.findFirst({where: {id, user: {supabaseAuthId: user.id}}});
 if (!job) notFound();
 const reviewed = job.reviewedDescription !== null;
 const initial = reviewed ? validateRequirements(job.requirements) : suggestRequirements(job.description);
 return <section className="space-y-6"><PageHeader eyebrow={`${job.title} at ${job.company}`} title="Review job requirements" />
  <Card><JobRequirementsReview key={job.id} id={job.id} description={job.description} version={job.reviewVersion} reviewed={reviewed} stale={reviewed && job.reviewedDescription !== job.description} initial={initial} /></Card>
 </section>;
}
export default function RequirementsPage({params}: {params: Promise<{id: string}>}) {
 return <div className="space-y-6"><Link href={SECTIONS.analysis.href} className="text-sm font-medium text-accent-text hover:underline">← Back to job analysis</Link><Suspense fallback={<LoadingBlock variant="form" label="Loading requirements…" />}><ReviewContent params={params} /></Suspense></div>;
}
