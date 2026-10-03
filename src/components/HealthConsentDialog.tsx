"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { saveHealthChoices } from "@/app/(member)/health-consent-actions";

/**
 * The health-info question (0043). Shown after sign-in until answered,
 * before a booking if they skipped it, and from any locked health screen.
 * Saying no never blocks booking; consent has to be freely given.
 */
export function HealthConsentDialog({
  onAnswered,
  onClose,
  reason,
}: {
  onAnswered: (consent: boolean) => void;
  /** Omit to make the dialog answer-only (no "Not now"). */
  onClose?: () => void;
  /** Optional line above the question, e.g. why it's showing now. */
  reason?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [trackBodyMetrics, setTrackBodyMetrics] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function answer(consent: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveHealthChoices(consent, trackBodyMetrics);
        if (result.error) {
          setError(result.error);
          return;
        }
        onAnswered(consent);
      } catch {
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="health-consent-title"
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 px-4 py-6"
    >
      <div className="w-full max-w-md max-h-full overflow-y-auto rounded-xl border border-blueprint-line bg-blueprint-bg p-5">
        <div className="flex items-center gap-3 mb-3">
          <Image src="/coach-ted.png" alt="" width={36} height={36} className="rounded-full object-cover shrink-0" />
          <p id="health-consent-title" className="text-blueprint-ink font-semibold">
            Can we keep your health info?
          </p>
        </div>

        {reason && <p className="text-sm text-blueprint-accent mb-3">{reason}</p>}

        <div className="space-y-3 text-sm text-blueprint-muted leading-relaxed">
          <p>
            To coach you properly, the app stores things like your weekly check-ins, how you&apos;re
            feeling before a session (including any pain or injuries), your habits and goals. Guy and
            your coaches can see them, and Coach Ted uses them to tailor his answers.
          </p>
          <p>
            It&apos;s your choice. Saying no doesn&apos;t affect your membership or booking. Check-ins,
            goals, habits and Coach Ted stay switched off until you say yes. You can change your mind
            any time in Account settings.
          </p>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-lg border border-blueprint-line px-3 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={trackBodyMetrics}
            onChange={(e) => setTrackBodyMetrics(e.target.checked)}
            disabled={isPending}
            className="mt-0.5 accent-blueprint-accent"
          />
          <span className="text-sm text-blueprint-ink">
            Include body measurements
            <span className="block text-xs text-blueprint-muted mt-0.5">
              Weight, waist and body fat. Untick if you&apos;d rather not track them. Everything else
              still works.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400 mt-3">
            {error}
          </p>
        )}

        <div className="mt-5 space-y-2">
          <button type="button" onClick={() => answer(true)} disabled={isPending} className="fb-btn-primary w-full">
            {isPending ? "Saving…" : "Yes, keep my health info"}
          </button>
          <button type="button" onClick={() => answer(false)} disabled={isPending} className="fb-btn-secondary w-full">
            No thanks
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="w-full text-xs text-blueprint-muted py-2 hover:text-blueprint-accent"
            >
              Not now
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-blueprint-muted">
          More in our{" "}
          <Link href="/privacy" className="underline hover:text-blueprint-accent">
            privacy notice
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
