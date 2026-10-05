"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookSession, cancelBooking } from "./actions";
import { HealthConsentDialog } from "@/components/HealthConsentDialog";
import { LATE_CANCEL_MS } from "@/lib/booking-window";

export function BookingButton({
  sessionId,
  bookingId,
  isFull,
  weekFull = false,
  startsAt,
}: {
  sessionId: string;
  bookingId: string | null;
  isFull: boolean;
  /** The member's plan allowance for that week is already used up. */
  weekFull?: boolean;
  /** Session start (epoch ms, ukSessionStart) — inside 3 hours a cancel is confirmed first. */
  startsAt?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [askingHealth, setAskingHealth] = useState(false);
  // Spec: "cancellation rules and any consequences are shown before
  // confirming a cancellation". Inside 3 hours the class still counts
  // towards their week (0059), so they're told before it goes through.
  const [confirmingLateCancel, setConfirmingLateCancel] = useState(false);

  function handlePress() {
    if (bookingId && startsAt !== undefined && Date.now() >= startsAt - LATE_CANCEL_MS) {
      setConfirmingLateCancel(true);
      return;
    }
    handleClick();
  }

  function handleClick() {
    setError(null);
    startTransition(async () => {
      let succeeded = false;

      try {
        const result = bookingId
          ? await cancelBooking(bookingId)
          : await bookSession(sessionId);

        if ("needsHealthAnswer" in result && result.needsHealthAnswer) {
          setAskingHealth(true);
        } else if (result.error) {
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
        onClick={handlePress}
        disabled={isPending || confirmingLateCancel}
        className={
          bookingId
            ? "text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-red-400 hover:text-red-400 disabled:opacity-50 transition"
            : "text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
        }
      >
        {isPending ? "…" : bookingId ? "Cancel" : "Book"}
      </button>
      {confirmingLateCancel && (
        <div className="max-w-[16rem] text-right space-y-1.5">
          <p className="text-xs text-blueprint-muted">
            It&apos;s less than 3 hours to go, so this still counts as one of your classes this week (a drop-in
            isn&apos;t refunded). If something came up, tell your coach: they can excuse it.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmingLateCancel(false)}
              className="text-xs text-blueprint-muted hover:text-blueprint-ink"
            >
              Keep my place
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingLateCancel(false);
                handleClick();
              }}
              className="text-xs text-red-400 hover:underline"
            >
              Cancel anyway
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
      {askingHealth && (
        <HealthConsentDialog
          reason="One quick question before your first booking."
          onClose={() => setAskingHealth(false)}
          onAnswered={() => {
            setAskingHealth(false);
            handleClick();
          }}
        />
      )}
    </div>
  );
}
