import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TwoFactorForm } from "./TwoFactorForm";

/**
 * Where src/lib/auth.ts sends coaches and the owner until they've entered
 * an authenticator code this session (0038). First time: set it up. After
 * that: enter the 6-digit code.
 */
export default async function TwoFactorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (aal?.currentLevel === "aal2") {
    redirect("/");
  }

  const hasCode = (factors?.totp ?? []).length > 0;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">
          {hasCode ? "Enter your code" : "Set up two-factor sign-in"}
        </h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          {hasCode
            ? "Open your authenticator (on iPhone, it can fill in automatically) and enter the 6-digit code for Fitness Blueprint."
            : "Staff accounts can see members' details, so they need a second step: a 6-digit code from your phone. It takes a minute to set up, once."}
        </p>
        <TwoFactorForm mode={hasCode ? "verify" : "enrol"} />
      </div>
    </main>
  );
}
