"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Setup = { factorId: string; qrCode: string; secret: string; uri: string };

// Codes are worked out from the time, and Supabase accepts one 30-second
// step either side. Three coaches' first codes were all refused
// (2026-10-22/23) while the server checked out fine, and two of their
// devices were a minute or more off — so say so before they try.
const CLOCK_WARNING_SECONDS = 25;

export const codeInputClass =
  "w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink tracking-[0.3em] text-center text-lg focus:outline-none focus:border-blueprint-accent";
export const codeButtonClass =
  "w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 disabled:opacity-50 transition";

/**
 * TOTP two-factor for staff (0038), on the browser client so the upgraded
 * aal2 session lands in the auth cookies. "enrol" = first-time setup
 * (QR code / "add to this phone" link + first code), "verify" = enter the
 * code at sign-in. Anyone stuck can use an emailed code instead
 * (EmailCodeForm, 0068).
 */
export function TwoFactorForm({ mode, serverNow }: { mode: "enrol" | "verify"; serverNow: number }) {
  const router = useRouter();
  const [clockSkewSeconds, setClockSkewSeconds] = useState(0);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    // Includes the page's load time, so it can only overstate a slow clock
    // by a second or two — well inside the warning threshold.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClockSkewSeconds(Math.round((Date.now() - serverNow) / 1000));
  }, [serverNow]);

  const clockWarning =
    Math.abs(clockSkewSeconds) >= CLOCK_WARNING_SECONDS ? (
      <p role="alert" className="text-sm text-amber-300 leading-relaxed">
        This device&apos;s clock is about {formatSkew(clockSkewSeconds)}. If your codes come from this device, they
        won&apos;t work until its date &amp; time is set to automatic (in Settings).
      </p>
    ) : null;

  async function startSetup() {
    setError(null);
    setIsPending(true);
    const supabase = createClient();

    // A half-finished earlier attempt leaves an unverified factor behind;
    // clear it so this one starts clean.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Fitness Blueprint ${new Date().toISOString().slice(0, 16)}`,
      issuer: "Fitness Blueprint",
    });
    setIsPending(false);
    if (enrollError || !data) {
      setError(enrollError?.message ?? "Couldn't start setup — please try again.");
      return;
    }
    const qr = data.totp.qr_code;
    setSetup({
      factorId: data.id,
      qrCode: qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${qr}`,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    const supabase = createClient();

    let factorId = setup?.factorId;
    if (!factorId) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      factorId = factors?.totp[0]?.id;
    }
    if (!factorId) {
      setIsPending(false);
      setError("No authenticator set up on this account — ask the owner to reset your two-factor.");
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (verifyError) {
      setIsPending(false);
      setError(
        verifyError.code === "mfa_verification_failed"
          ? "That code wasn't accepted. Type the code your authenticator shows for Fitness Blueprint right now — not one suggested from a text message — and check your phone's time is set to automatic."
          : verifyError.message
      );
      return;
    }

    // An owner-issued temporary password still has to be changed.
    const { data: userData } = await supabase.auth.getUser();
    router.replace(userData.user?.app_metadata?.must_change_password ? "/login/set-password" : "/");
    router.refresh();
  }

  if (mode === "enrol" && !setup) {
    return (
      <div className="space-y-4">
        <ol className="text-sm text-blueprint-muted leading-relaxed list-decimal pl-5 space-y-1">
          <li>Tap the button below.</li>
          <li>
            On this phone, tap <strong className="text-blueprint-ink">Add to this phone</strong> (iPhone saves it in
            Passwords). On a computer, scan the QR code with your phone.
          </li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        <p className="text-xs text-blueprint-muted leading-relaxed">
          On Android, install Google Authenticator from the Play Store first — &quot;Add to this phone&quot; needs it.
        </p>
        {clockWarning}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button type="button" onClick={startSetup} disabled={isPending} className={codeButtonClass}>
          {isPending ? "Starting…" : "Set up two-factor"}
        </button>
        <SignOutButton />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {setup && (
        <div className="space-y-4">
          <a href={setup.uri} className={`${codeButtonClass} block text-center`}>
            Add to this phone
          </a>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from Supabase, nothing to optimise */}
            <img src={setup.qrCode} alt="QR code to scan with your authenticator app" className="w-44 h-44 bg-white p-2 rounded" />
          </div>
          <p className="text-xs text-blueprint-muted text-center">
            Can&apos;t scan or tap?{" "}
            <button type="button" onClick={() => setShowSecret((s) => !s)} className="underline hover:text-blueprint-accent">
              {showSecret ? "Hide" : "Show"} the setup key
            </button>
          </p>
          {showSecret && (
            <p className="text-xs text-blueprint-ink text-center font-mono break-all select-all">{setup.secret}</p>
          )}
        </div>
      )}
      {clockWarning}
      <div>
        <label htmlFor="code" className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          6-digit code
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          className={codeInputClass}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={isPending || code.length !== 6} className={codeButtonClass}>
        {isPending ? "Checking…" : setup ? "Turn on two-factor" : "Continue"}
      </button>
      <SignOutButton />
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }
  return (
    <button type="button" onClick={handleSignOut} className="w-full text-xs text-blueprint-muted hover:text-blueprint-accent">
      Sign out
    </button>
  );
}

function formatSkew(seconds: number) {
  const amount = Math.abs(seconds) >= 90 ? `${Math.round(Math.abs(seconds) / 60)} minutes` : `${Math.abs(seconds)} seconds`;
  return `${amount} ${seconds > 0 ? "fast" : "slow"}`;
}
