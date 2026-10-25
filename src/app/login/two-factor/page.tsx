import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmailCodeForm } from "./EmailCodeForm";
import { TwoFactorForm } from "./TwoFactorForm";

/**
 * Where src/lib/auth.ts sends coaches and the owner until they've done
 * the second step this session. Main way: an authenticator app (0038) —
 * set it up the first time, then enter its code. Backup for anyone stuck
 * on setup or without their phone: a 6-digit code emailed to them (0068,
 * ?method=email).
 */
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ method?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [{ data: verified }, { data: factors }, { method }] = await Promise.all([
    supabase.rpc("staff_session_verified"),
    supabase.auth.mfa.listFactors(),
    searchParams,
  ]);
  if (verified) {
    redirect("/");
  }

  const useEmail = method === "email";
  const hasCode = (factors?.totp ?? []).length > 0;
  const linkClass = "underline hover:text-blueprint-accent";

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">
          {useEmail ? "Check your email" : hasCode ? "Enter your code" : "Set up two-factor sign-in"}
        </h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          {useEmail
            ? "We'll email you a 6-digit code to finish signing in."
            : hasCode
              ? "Open your authenticator (on iPhone, it can fill in automatically) and enter the 6-digit code for Fitness Blueprint."
              : "Staff accounts can see members' details, so they need a second step: a 6-digit code from your phone. It takes a minute to set up, once."}
        </p>
        {useEmail ? <EmailCodeForm /> : <TwoFactorForm mode={hasCode ? "verify" : "enrol"} serverNow={new Date().getTime()} />}
        <p className="mt-6 text-center text-xs text-blueprint-muted">
          {useEmail ? (
            <Link href="/login/two-factor" className={linkClass}>
              Use my authenticator app instead
            </Link>
          ) : (
            <>
              {hasCode ? "Phone not with you?" : "Stuck setting it up?"}{" "}
              <Link href="/login/two-factor?method=email" className={linkClass}>
                Email me a code instead
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
