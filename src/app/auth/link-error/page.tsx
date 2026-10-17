import Link from "next/link";

export default function LinkErrorPage() {
  return <main className="mx-auto w-full max-w-md space-y-5 px-6 py-16">
    <h1 className="text-3xl font-bold">We could not verify this link</h1>
    <p>The link may have expired, already been used, or been opened in another browser. Open the newest email in the browser where you requested it.</p>
    <p><Link className="underline" href="/forgot-password">Request a new password-reset link</Link></p>
    <p><Link className="underline" href="/login">Return to sign in</Link></p>
    <p>If you confirmed your signup email, try signing in. Contact the app owner if you still cannot access your account.</p>
  </main>;
}
