import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { suggestRequirements, validateRequirements } from "@/lib/job-requirements";
import { JobRequirementsReview } from "@/components/job-requirements-review";
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
 return <section className="space-y-6"><h1 className="text-3xl font-bold">Review job requirements</h1><p>{job.title} at {job.company}</p>
  <JobRequirementsReview key={job.id} id={job.id} description={job.description} version={job.reviewVersion} reviewed={reviewed} stale={reviewed && job.reviewedDescription !== job.description} initial={initial} />
 </section>;
}
export default function RequirementsPage({params}: {params: Promise<{id: string}>}) {
 return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-16"><Link href="/jobs" className="underline">Back to saved jobs</Link><Suspense fallback={<p role="status">Loading requirements…</p>}><ReviewContent params={params} /></Suspense></main>;
}
