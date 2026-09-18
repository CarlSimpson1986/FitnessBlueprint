import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function AccountPage() {
  const { profile } = await requireProfile();

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="max-w-md mx-auto">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Your profile</h1>
        <p className="text-xs text-blueprint-muted mb-6">{profile.email}</p>

        {(profile.role === "owner" || profile.role === "coach") && (
          <Link href="/admin" className="fb-card flex items-center justify-between mb-6">
            <span className="text-blueprint-ink font-medium">Admin</span>
            <span className="text-blueprint-muted text-sm">Manage sessions &amp; members →</span>
          </Link>
        )}

        <p className="fb-eyebrow mb-3">Password</p>
        <p className="text-blueprint-muted text-sm leading-relaxed mb-6">
          Optional — you can always sign in with a magic link instead. Set a password here if
          you&apos;d rather use one.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
