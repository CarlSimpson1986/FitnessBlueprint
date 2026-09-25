"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { summariseLastWeek } from "./actions";

type Result = Awaited<ReturnType<typeof summariseLastWeek>>;

/** "What's Ted noticed?" — the same summary Guy gets by email on Mondays. */
export function WeeklySummaryCard() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  return (
    <div className="fb-card mb-10">
      <div className="flex items-start gap-3">
        <Image src="/coach-ted.png" alt="" width={32} height={32} className="rounded-full object-cover shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-blueprint-ink font-medium">Ted&apos;s summary of the last 7 days</p>
          <p className="text-xs text-blueprint-muted mt-0.5">
            Themes from feedback comments and Sunday check-ins. You also get this by email every Monday.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(async () => setResult(await summariseLastWeek()))}
          className="fb-btn-primary text-sm shrink-0 disabled:opacity-50"
        >
          {isPending ? "Reading…" : result ? "Refresh" : "Summarise"}
        </button>
      </div>

      {result?.status === "error" && <p className="text-xs text-red-400 mt-3">{result.error}</p>}
      {result?.status === "too_little" && (
        <p className="text-sm text-blueprint-muted mt-4">
          Only {result.noteCount} comment{result.noteCount === 1 ? "" : "s"} or check-in{result.noteCount === 1 ? "" : "s"} this
          week — not enough to spot patterns. They&apos;re all below.
        </p>
      )}
      {result?.status === "ok" && (
        <div className="mt-4 border-t border-blueprint-line pt-4">
          {result.averages && (
            <p className="text-xs text-blueprint-muted mb-3">
              Average ratings this week: class {result.averages.class} · effort {result.averages.effort} · experience{" "}
              {result.averages.experience} (out of 5), from {result.noteCount} notes.
            </p>
          )}
          <p className="text-sm text-blueprint-ink whitespace-pre-wrap leading-relaxed">{result.text}</p>
        </div>
      )}
    </div>
  );
}
