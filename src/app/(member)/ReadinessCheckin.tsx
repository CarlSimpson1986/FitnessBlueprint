"use client";

import Image from "next/image";
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
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? "text-sm font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2.5 transition"
              : "text-sm font-medium text-blueprint-ink border border-blueprint-line rounded-lg px-3 py-2.5 hover:border-blueprint-accent transition"
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
    return (
      <p className="mt-3 text-xs text-blueprint-accent">✓ Checked in — your coach can see how you&apos;re feeling.</p>
    );
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
    <div className="mt-3 rounded-xl border border-blueprint-accent/50 bg-blueprint-accent/10 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <Image src="/coach-ted.png" alt="" width={28} height={28} className="rounded-full object-cover shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blueprint-ink">Pre-session check-in</p>
          <p className="text-xs text-blueprint-muted">10 seconds — helps your coach pace today&apos;s session for you.</p>
        </div>
      </div>
      <p className="text-sm text-blueprint-ink">How are you feeling?</p>
      <PillPicker options={FEELINGS} value={feeling} onChange={setFeeling} />
      <input
        type="text"
        value={painArea}
        onChange={(event) => setPainArea(event.target.value)}
        placeholder="Any pain or niggles? (optional)"
        className="w-full text-sm bg-blueprint-bg border border-blueprint-line rounded-lg px-3 py-2.5 text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!feeling || isPending}
        className="w-full text-sm font-medium text-blueprint-accent border border-blueprint-accent rounded-lg px-3 py-2.5 hover:bg-blueprint-accent/15 disabled:opacity-50 transition"
      >
        {isPending ? "…" : feeling ? "Send to my coach" : "Pick how you're feeling to send"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
