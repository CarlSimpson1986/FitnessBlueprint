"use client";

import { useState, useTransition } from "react";
import { sendTestEmail } from "./actions";

/** Owner-only card on /admin: prove Brevo delivers with one click. */
export function EmailCheckCard() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; sentTo?: string } | null>(null);

  return (
    <div className="border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5">
      <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">Email check</p>
      <p className="text-blueprint-muted text-sm leading-relaxed mb-4">
        Send yourself one email through Brevo to confirm reminders can go out.
      </p>
      <button
        type="button"
        onClick={() => startTransition(async () => setResult(await sendTestEmail()))}
        disabled={isPending}
        className="fb-btn-primary w-full text-xs disabled:opacity-50"
      >
        {isPending ? "Sending…" : "Send me a test email"}
      </button>
      {result?.sentTo && (
        <p className="text-xs text-blueprint-accent mt-2">
          Brevo accepted it — check {result.sentTo} (and spam).
        </p>
      )}
      {result?.error && <p className="text-xs text-red-400 mt-2 break-words">{result.error}</p>}
    </div>
  );
}
