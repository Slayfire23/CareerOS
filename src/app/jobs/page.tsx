import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { SavedJobs } from "@/components/saved-jobs";
async function JobsContent() {
 await connection();
 const supabase = await createClient();
 const { data: { user }, error } = await supabase.auth.getUser();
 if (error || !user) redirect("/login");
 const jobs = await prisma.savedJob.findMany({ where: { user: { supabaseAuthId: user.id } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, title: true, company: true, postingUrl: true, description: true } });
 return <SavedJobs jobs={jobs} />;
}
export default function JobsPage() {
 return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-16">
  <Link className="underline" href="/dashboard">Back to dashboard</Link>
  <h1 className="text-3xl font-bold">Saved jobs</h1>
  <p>Keep job descriptions here for future review. Saving a job does not submit an application or analyze your fit.</p>
  <Suspense fallback={<p role="status">Loading your jobs…</p>}><JobsContent /></Suspense>
 </main>;
}
