"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptBookingInvite, declineBookingInvite } from "./actions";

export function InviteResponsePanel({
  bookingId,
  inviterName,
  expiresAt,
}: {
  bookingId: string;
  inviterName: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const expiresLabel = new Date(expiresAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function respond(action: "accept" | "decline") {
    setError(null);
    startTransition(async () => {
      const result =
        action === "accept" ? await acceptBookingInvite(bookingId) : await declineBookingInvite(bookingId);

      if (result.error) {
        setError(result.error);
      } else {
        startTransition(() => router.refresh());
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-xs font-medium text-blueprint-accent text-right">
        {inviterName} invited you — expires {expiresLabel}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={isPending}
          className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={isPending}
          className="text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-red-400 hover:text-red-400 disabled:opacity-50 transition"
        >
          Decline
        </button>
      </div>
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
