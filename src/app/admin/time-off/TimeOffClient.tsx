"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTimeOff, deleteTimeOff } from "./actions";

const inputClass =
  "bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent";

export function AddTimeOffForm({ coaches }: { coaches: { id: string; full_name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addTimeOff({ coachId, startsOn, endsOn: endsOn || startsOn, note });
      if (result.error) {
        setError(result.error);
        return;
      }
      setStartsOn("");
      setEndsOn("");
      setNote("");
      startTransition(() => router.refresh());
    });
  }

  return (
    <div className="fb-card space-y-3 mb-10">
      <p className="text-blueprint-ink font-medium">Add time off</p>
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[11px] text-blueprint-muted">
          Coach
          <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={inputClass}>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-blueprint-muted">
          From
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-blueprint-muted">
          To (blank = one day)
          <input type="date" value={endsOn} min={startsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-blueprint-muted">
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Holiday" className={inputClass} />
        </label>
      </div>
      <button
        type="button"
        disabled={isPending || !coachId || !startsOn}
        onClick={submit}
        className="fb-btn-primary text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save time off"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function DeleteTimeOffButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-blueprint-muted hover:text-red-400 transition">
        Remove
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteTimeOff(id);
            startTransition(() => router.refresh());
          })
        }
        className="text-red-400"
      >
        {isPending ? "…" : "Yes, remove"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-blueprint-muted">
        Cancel
      </button>
    </span>
  );
}
