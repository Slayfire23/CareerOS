import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

export default function PasswordUpdatedPage() {
  return <AuthShell>
    <h1 className="text-2xl font-bold tracking-tight">Password updated</h1>
    <p>You have been signed out of this browser. Sign in with your new password.</p>
    <Link href="/login" className="btn btn-primary w-full">Sign in</Link>
  </AuthShell>;
}
