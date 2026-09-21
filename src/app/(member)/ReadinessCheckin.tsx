"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitReadinessCheckin } from "./readiness-actions";

// Labels relabelled to match the build-spec's energy-scale wording; the
// underlying DB values (great/okay/rough) are unchanged — SessionRoster.tsx's
// red-flagging on "rough" and the readiness_checkins check constraint both
// stay as-is. sleep_quality still exists in the schema (nullable) but the
// new check-in UI dropped that field, so it's always submitted as null.
const FEELINGS = [
  { value: "rough", label: "Low energy" },
  { value: "okay", label: "Normal" },
  { value: "great", label: "Feeling strong" },
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
        sleepQuality: null,
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
      <p className="text-xs text-blueprint-muted">How are you feeling</p>
      <PillPicker options={FEELINGS} value={feeling} onChange={setFeeling} />
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
