import { requireProfile } from "@/lib/auth";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function AccountPage() {
  const { profile } = await requireProfile();

  return (
    <main className="blueprint-grid min-h-screen px-6 py-16">
      <div className="max-w-md mx-auto">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-2">Your account</h1>
        <p className="text-xs text-blueprint-muted mb-10">{profile.email}</p>

        <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-muted uppercase mb-4">
          Password
        </h2>
        <p className="text-blueprint-muted text-sm leading-relaxed mb-6">
          Optional — you can always sign in with a magic link instead. Set a password here if
          you&apos;d rather use one.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
