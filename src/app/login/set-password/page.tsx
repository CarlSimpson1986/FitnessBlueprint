import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "./SetPasswordForm";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Staff with two-factor set up enter their code first — changing the
  // password of an account that has it needs a two-factor session (0038).
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if ((factors?.totp ?? []).length > 0 && aal?.currentLevel !== "aal2") {
    redirect("/login/two-factor");
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="fb-eyebrow mb-1">
          Fitness Blueprint
        </p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Set your password</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Choose a password for your account. You&apos;ll use it with your email to sign in.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
