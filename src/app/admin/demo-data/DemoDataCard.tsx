"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearDemoData, loadDemoData } from "./actions";

/** Owner-only card on /admin: load or remove the demo clients + classes. */
export function DemoDataCard({ loaded }: { loaded: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <div className="fb-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-blueprint-muted mb-2">Demo data</p>
      <p className="text-blueprint-muted text-sm leading-relaxed mb-4">
        {loaded
          ? "5 demo clients and 4 weeks of Test Coach classes are loaded. Removing them deletes all of it."
          : "Add 5 demo clients and 4 weeks of classes (with workouts, bookings, logs and feedback) to see the app full."}
      </p>
      <button
        type="button"
        onClick={() => run(loaded ? clearDemoData : loadDemoData)}
        disabled={isPending}
        className="fb-btn-primary w-full text-xs disabled:opacity-50"
      >
        {isPending ? (loaded ? "Removing…" : "Loading…") : loaded ? "Remove demo data" : "Load demo data"}
      </button>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
