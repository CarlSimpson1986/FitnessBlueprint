"use client";

import { useState, useTransition } from "react";
import { bookSession, cancelBooking } from "./actions";

export function BookingButton({
  sessionId,
  bookingId,
  isFull,
}: {
  sessionId: string;
  bookingId: string | null;
  isFull: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = bookingId
        ? await cancelBooking(bookingId)
        : await bookSession(sessionId);

      if (result.error) {
        setError(result.error);
      }
    });
  }

  if (!bookingId && isFull) {
    return (
      <span className="text-xs font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line/60 rounded px-3 py-2">
        Full
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={
          bookingId
            ? "text-xs font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-3 py-2 hover:border-red-400 hover:text-red-400 disabled:opacity-50 transition"
            : "text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
        }
      >
        {isPending ? "…" : bookingId ? "Cancel" : "Book"}
      </button>
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
