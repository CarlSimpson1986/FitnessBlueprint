"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookSession, cancelBooking } from "./actions";

export function BookingButton({
  sessionId,
  bookingId,
  isFull,
  weekFull = false,
}: {
  sessionId: string;
  bookingId: string | null;
  isFull: boolean;
  /** The member's plan allowance for that week is already used up. */
  weekFull?: boolean;
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
      <span className="text-xs font-medium text-blueprint-muted border border-blueprint-line/60 rounded-lg px-3 py-2">
        Full
      </span>
    );
  }

  if (!bookingId && weekFull) {
    return (
      <span className="text-xs font-medium text-blueprint-muted border border-blueprint-line/60 rounded-lg px-3 py-2 text-center">
        Week full
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
            ? "text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-red-400 hover:text-red-400 disabled:opacity-50 transition"
            : "text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
        }
      >
        {isPending ? "…" : bookingId ? "Cancel" : "Book"}
      </button>
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
