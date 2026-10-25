"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendStaffSignInCode, verifyStaffSignInCode } from "./actions";
import { SignOutButton, codeButtonClass, codeInputClass } from "./TwoFactorForm";

/**
 * Staff second step by emailed code (0068). Not sent automatically on page
 * load — a reload or prefetch would otherwise send another email — so the
 * first tap asks for it.
 */
export function EmailCodeForm() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sendCode() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendStaffSignInCode();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (sentTo) setNotice("New code sent — use the latest email.");
      setSentTo(result.sentTo ?? "your email");
      setCode("");
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await verifyStaffSignInCode(code);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace(result.next ?? "/");
      router.refresh();
    });
  }

  if (!sentTo) {
    return (
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <button type="button" onClick={sendCode} disabled={isPending} className={codeButtonClass}>
          {isPending ? "Sending…" : "Email me a code"}
        </button>
        <SignOutButton />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-blueprint-muted leading-relaxed">
        We&apos;ve sent a 6-digit code to <span className="text-blueprint-ink">{sentTo}</span>. It works for 10
        minutes — check spam if it isn&apos;t there.
      </p>
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
          autoFocus
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
      {notice && <p className="text-sm text-blueprint-muted">{notice}</p>}
      <button type="submit" disabled={isPending || code.length !== 6} className={codeButtonClass}>
        {isPending ? "Checking…" : "Continue"}
      </button>
      <button
        type="button"
        onClick={sendCode}
        disabled={isPending}
        className="w-full text-xs text-blueprint-muted hover:text-blueprint-accent"
      >
        Send a new code
      </button>
      <SignOutButton />
    </form>
  );
}
