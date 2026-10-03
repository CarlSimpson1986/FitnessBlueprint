"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveHealthChoices } from "@/app/(member)/health-consent-actions";

/** Change the health-info answer (0043) any time. Saves on each tap. */
export function HealthSettingsCard({
  consent,
  trackBodyMetrics,
}: {
  consent: boolean | null;
  trackBodyMetrics: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState({ consent: consent === true, metrics: consent === true && trackBodyMetrics });
  const [error, setError] = useState<string | null>(null);

  function save(next: { consent: boolean; metrics: boolean }) {
    const previous = state;
    setError(null);
    setState(next);
    startTransition(async () => {
      try {
        const result = await saveHealthChoices(next.consent, next.metrics);
        if (result.error) {
          setState(previous);
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setState(previous);
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="fb-card space-y-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={state.consent}
          disabled={isPending}
          onChange={(e) => save({ consent: e.target.checked, metrics: e.target.checked })}
          className="mt-0.5 accent-blueprint-accent"
        />
        <span className="text-sm text-blueprint-ink">
          Keep my health info
          <span className="block text-xs text-blueprint-muted mt-0.5">
            Check-ins, readiness, habits, goals and Coach Ted. Turning this off hides what you&apos;ve
            already given from your coaches; email us if you&apos;d like it deleted.
          </span>
        </span>
      </label>

      <label className={"flex items-start gap-3 " + (state.consent ? "cursor-pointer" : "opacity-50")}>
        <input
          type="checkbox"
          checked={state.metrics}
          disabled={isPending || !state.consent}
          onChange={(e) => save({ consent: true, metrics: e.target.checked })}
          className="mt-0.5 accent-blueprint-accent"
        />
        <span className="text-sm text-blueprint-ink">
          Track body measurements
          <span className="block text-xs text-blueprint-muted mt-0.5">
            Weight, waist and body fat. Off means you&apos;re never asked for them.
          </span>
        </span>
      </label>

      {consent === null && !error && (
        <p className="text-xs text-blueprint-muted">You haven&apos;t answered this yet.</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
