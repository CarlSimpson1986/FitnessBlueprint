"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Setup = { factorId: string; qrCode: string; secret: string; uri: string };

const inputClass =
  "w-full bg-blueprint-raised border border-blueprint-line rounded px-4 py-3 text-blueprint-ink tracking-[0.3em] text-center text-lg focus:outline-none focus:border-blueprint-accent";
const buttonClass =
  "w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 disabled:opacity-50 transition";

/**
 * TOTP two-factor for staff (0038), on the browser client so the upgraded
 * aal2 session lands in the auth cookies. "enrol" = first-time setup
 * (QR code / "add to this phone" link + first code), "verify" = enter the
 * code at sign-in.
 */
export function TwoFactorForm({ mode }: { mode: "enrol" | "verify" }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

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
        verifyError.message.toLowerCase().includes("invalid")
          ? "That code didn't work. Codes change every 30 seconds — try the current one."
          : verifyError.message
      );
      return;
    }

    // An owner-issued temporary password still has to be changed.
    const { data: userData } = await supabase.auth.getUser();
    router.replace(userData.user?.app_metadata?.must_change_password ? "/login/set-password" : "/");
    router.refresh();
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.replace("/login");
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
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button type="button" onClick={startSetup} disabled={isPending} className={buttonClass}>
          {isPending ? "Starting…" : "Set up two-factor"}
        </button>
        <button type="button" onClick={handleSignOut} className="w-full text-xs text-blueprint-muted hover:text-blueprint-accent">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {setup && (
        <div className="space-y-4">
          <a href={setup.uri} className={`${buttonClass} block text-center`}>
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
          className={inputClass}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={isPending || code.length !== 6} className={buttonClass}>
        {isPending ? "Checking…" : setup ? "Turn on two-factor" : "Continue"}
      </button>
      <button type="button" onClick={handleSignOut} className="w-full text-xs text-blueprint-muted hover:text-blueprint-accent">
        Sign out
      </button>
    </form>
  );
}
