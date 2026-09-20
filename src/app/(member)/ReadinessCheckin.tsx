"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReadinessCheckin } from "./readiness-actions";

const FEELINGS = [
  { value: "great", label: "Great" },
  { value: "okay", label: "Okay" },
  { value: "rough", label: "Rough" },
] as const;

const SLEEP_QUALITIES = [
  { value: "good", label: "Good" },
  { value: "average", label: "Average" },
  { value: "poor", label: "Poor" },
] as const;

function PillPicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? "text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-1.5 transition"
              : "text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-1.5 hover:border-blueprint-accent transition"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ReadinessCheckin({
  sessionId,
  hasCheckedIn,
}: {
  sessionId: string;
  hasCheckedIn: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(hasCheckedIn);
  const [feeling, setFeeling] = useState<(typeof FEELINGS)[number]["value"] | null>(null);
  const [sleepQuality, setSleepQuality] = useState<(typeof SLEEP_QUALITIES)[number]["value"] | null>(
    null
  );
  const [painArea, setPainArea] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return null;
  }

  function handleSubmit() {
    if (!feeling) return;
    setError(null);

    startTransition(async () => {
      const result = await submitReadinessCheckin({
        sessionId,
        feeling: feeling!,
        sleepQuality,
        painArea,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setDone(true);
      startTransition(() => router.refresh());
    });
  }

  return (
    <div className="border-t border-blueprint-line/60 mt-3 pt-3 space-y-2">
      <p className="text-xs text-blueprint-muted">Quick check-in before you train</p>
      <PillPicker options={FEELINGS} value={feeling} onChange={setFeeling} />
      <PillPicker options={SLEEP_QUALITIES} value={sleepQuality} onChange={setSleepQuality} />
      <input
        type="text"
        value={painArea}
        onChange={(event) => setPainArea(event.target.value)}
        placeholder="Any pain or niggles? (optional)"
        className="w-full text-xs bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!feeling || isPending}
          className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-1.5 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Send check-in"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
