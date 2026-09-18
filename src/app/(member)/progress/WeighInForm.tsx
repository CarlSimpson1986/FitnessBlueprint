"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { logWeighIn } from "./weigh-in-actions";

export function WeighInForm() {
  const router = useRouter();
  const [weight, setWeight] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const weightKg = Number(weight);

    startTransition(async () => {
      const result = await logWeighIn(weightKg);
      if (result.error) {
        setError(result.error);
        return;
      }
      setWeight("");
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        min="1"
        max="500"
        required
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
        placeholder="Weight (kg)"
        className="flex-1 bg-blueprint-bg border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
      />
      <button type="submit" disabled={isPending} className="fb-btn-secondary disabled:opacity-50">
        {isPending ? "…" : "Log"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
