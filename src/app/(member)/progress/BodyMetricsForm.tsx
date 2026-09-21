"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { logBodyMetrics } from "./body-metrics-actions";

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function BodyMetricsForm() {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await logBodyMetrics({
        weightKg: toNumberOrNull(weight),
        waistCm: toNumberOrNull(waist),
        bodyFatPct: toNumberOrNull(bodyFat),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setWeight("");
      setWaist("");
      setBodyFat("");
      setSaved(true);
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="fb-card space-y-3">
      <p className="text-xs text-blueprint-muted">
        Log whatever you&apos;ve got — leave the rest blank and update it another time.
      </p>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">Weight (kg)</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="e.g. 74.8"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-full bg-blueprint-bg border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">Waist (cm)</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="e.g. 87"
          value={waist}
          onChange={(e) => setWaist(e.target.value)}
          className="w-full bg-blueprint-bg border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">Body fat %</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="e.g. 20.5"
          value={bodyFat}
          onChange={(e) => setBodyFat(e.target.value)}
          className="w-full bg-blueprint-bg border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <button type="submit" disabled={isPending} className="fb-btn-primary w-full disabled:opacity-50">
        {isPending ? "Saving…" : "Save"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {saved && !error && <p className="text-xs text-blueprint-accent">Saved.</p>}
    </form>
  );
}
