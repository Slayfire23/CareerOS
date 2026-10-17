import Link from "next/link";

export default function PasswordUpdatedPage() {
  return <main className="mx-auto w-full max-w-md space-y-5 px-6 py-16">
    <h1 className="text-3xl font-bold">Password updated</h1>
    <p>You have been signed out of this browser. Sign in with your new password.</p>
    <Link href="/login" className="underline">Sign in</Link>
  </main>;
}
