import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getResumes } from "@/lib/resumes";
import { Resumes } from "@/components/resumes";
import { Card, LoadingBlock, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Resumes" };

async function ResumesContent() {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  return <Card><Resumes {...await getResumes()} /></Card>;
}

export default function ResumesPage() {
  return <div className="space-y-8">
    <PageHeader title="Resumes" description="Private PDF versions of your resume. Review suggestions from one before anything is saved to your profile." />
    <Suspense fallback={<LoadingBlock label="Loading resumes…" />}><ResumesContent /></Suspense>
  </div>;
}
