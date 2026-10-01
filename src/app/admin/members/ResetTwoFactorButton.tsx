"use client";

import { useState, useTransition } from "react";
import { resetTwoFactor } from "./actions";

/** Two-step (no browser confirm): Reset two-factor → "Yes, reset". */
export function ResetTwoFactorButton({ personId, name }: { personId: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; done?: boolean } | null>(null);

  function handleReset() {
    setResult(null);
    startTransition(async () => {
      try {
        const outcome = await resetTwoFactor(personId);
        setResult(outcome.error ? { error: outcome.error } : { done: true });
      } catch {
        setResult({ error: "Something went wrong — please try again." });
      }
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-300">Reset {name}&apos;s two-factor?</span>
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-amber-300 rounded px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            {isPending ? "…" : "Yes, reset"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-xs font-mono uppercase tracking-wide text-blueprint-muted px-2 py-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-3 py-2 hover:border-blueprint-accent hover:text-blueprint-accent transition"
        >
          Reset two-factor
        </button>
      )}
      {result?.done && <p className="text-xs text-blueprint-accent">Done — they&apos;ll set it up again at next sign-in.</p>}
      {result?.error && <p className="text-xs text-red-400 max-w-[18rem] text-right">{result.error}</p>}
    </div>
  );
}
