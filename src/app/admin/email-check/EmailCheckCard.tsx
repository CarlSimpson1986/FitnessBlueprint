"use client";

import { useState, useTransition } from "react";
import { sendMondayDigestPreview, sendMonthlyReportPreview, sendTestEmail, type ActionResult, type PreviewResult } from "./actions";

/** Owner-only card on /admin: prove Brevo delivers with one click. */
export function EmailCheckCard() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; sentTo?: string } | null>(null);
  const [isPreviewPending, startPreview] = useTransition();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isDigestPending, startDigest] = useTransition();
  const [digest, setDigest] = useState<ActionResult | null>(null);

  return (
    <div className="fb-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-blueprint-muted mb-2">Email check</p>
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

      <p className="text-blueprint-muted text-sm leading-relaxed mt-5 mb-3">
        Members get a progress email on the 1st of each month. See last month&apos;s, for whoever trained most.
      </p>
      <button
        type="button"
        onClick={() => startPreview(async () => setPreview(await sendMonthlyReportPreview()))}
        disabled={isPreviewPending}
        className="fb-btn-primary w-full text-xs disabled:opacity-50"
      >
        {isPreviewPending ? "Sending…" : "Email me a monthly report preview"}
      </button>
      {preview?.sentTo && (
        <p className="text-xs text-blueprint-accent mt-2">
          Sent {preview.memberName}&apos;s report to {preview.sentTo}.
        </p>
      )}
      {preview?.error && <p className="text-xs text-red-400 mt-2 break-words">{preview.error}</p>}

      <p className="text-blueprint-muted text-sm leading-relaxed mt-5 mb-3">
        Your Monday email lists who needs a personal message. See what it would say today.
      </p>
      <button
        type="button"
        onClick={() => startDigest(async () => setDigest(await sendMondayDigestPreview()))}
        disabled={isDigestPending}
        className="fb-btn-primary w-full text-xs disabled:opacity-50"
      >
        {isDigestPending ? "Sending…" : "Email me a Monday digest preview"}
      </button>
      {digest?.sentTo && <p className="text-xs text-blueprint-accent mt-2">Sent to {digest.sentTo}.</p>}
      {digest?.error && <p className="text-xs text-red-400 mt-2 break-words">{digest.error}</p>}
    </div>
  );
}
