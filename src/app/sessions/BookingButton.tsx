"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let succeeded = false;

      try {
        const result = bookingId
          ? await cancelBooking(bookingId)
          : await bookSession(sessionId);

        if (result.error) {
          setError(result.error);
        } else {
          succeeded = true;
        }
      } catch {
        setError("Something went wrong — please try again.");
      }

      // router.refresh() runs its own internal transition — starting it
      // as a fresh transition here (rather than nesting the call inside
      // the one above) is what keeps isPending true until the refreshed
      // data actually lands, instead of resolving early and only
      // visibly updating once some other transition happens to flush it.
      if (succeeded) {
        startTransition(() => {
          router.refresh();
        });
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
