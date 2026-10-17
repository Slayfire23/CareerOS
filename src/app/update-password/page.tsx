import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RecoveryForm } from "@/components/recovery-form";

async function UpdatePasswordContent() {
  await connection();
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/auth/link-error");
  return <RecoveryForm mode="update" />;
}

export default function UpdatePasswordPage() {
  return <main className="mx-auto w-full max-w-md px-6 py-16">
    <Suspense fallback={<p role="status">Checking your session…</p>}><UpdatePasswordContent /></Suspense>
  </main>;
}
