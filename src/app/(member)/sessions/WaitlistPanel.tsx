"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptWaitlistOffer, joinWaitlist, leaveWaitlist } from "./actions";

type WaitlistEntry = {
  id: string;
  status: "waiting" | "offered" | "accepted" | "expired" | "declined";
  buddyName: string | null;
  offerExpiresAt: string | null;
};

export function WaitlistPanel({
  sessionId,
  entry,
}: {
  sessionId: string;
  entry: WaitlistEntry | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [buddyEmail, setBuddyEmail] = useState("");
  const [showBuddyField, setShowBuddyField] = useState(false);

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinWaitlist(sessionId, buddyEmail);
      if (result.error) {
        setError(result.error);
      } else {
        setBuddyEmail("");
        setShowBuddyField(false);
        refresh();
      }
    });
  }

  function handleLeave() {
    if (!entry) return;
    setError(null);
    startTransition(async () => {
      const result = await leaveWaitlist(entry.id);
      if (result.error) {
        setError(result.error);
      } else {
        refresh();
      }
    });
  }

  function handleAccept() {
    if (!entry) return;
    setError(null);
    startTransition(async () => {
      const result = await acceptWaitlistOffer(entry.id);
      if (result.error) {
        setError(result.error);
      } else {
        refresh();
      }
    });
  }

  if (entry?.status === "offered") {
    const expiresLabel = entry.offerExpiresAt
      ? new Date(entry.offerExpiresAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-xs font-medium text-blueprint-accent text-right">
          Spot offered{expiresLabel ? ` — expires ${expiresLabel}` : ""}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAccept}
            disabled={isPending}
            className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            {isPending ? "…" : "Accept"}
          </button>
          <button
            type="button"
            onClick={handleLeave}
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

  if (entry?.status === "waiting") {
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-xs text-blueprint-muted text-right">
          On the waitlist{entry.buddyName ? ` with ${entry.buddyName}` : ""}
        </p>
        <button
          type="button"
          onClick={handleLeave}
          disabled={isPending}
          className="text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-red-400 hover:text-red-400 disabled:opacity-50 transition"
        >
          {isPending ? "…" : "Leave waitlist"}
        </button>
        {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {showBuddyField ? (
        <div className="flex flex-col items-end gap-1">
          <input
            type="email"
            value={buddyEmail}
            onChange={(e) => setBuddyEmail(e.target.value)}
            placeholder="Buddy's email (optional)"
            className="text-xs bg-transparent border border-blueprint-line rounded-lg px-2 py-1.5 text-blueprint-ink placeholder:text-blueprint-muted w-44 text-right"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={isPending}
            className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
          >
            {isPending ? "…" : "Join waitlist"}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowBuddyField(true)}
            className="text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-blueprint-accent hover:text-blueprint-accent transition"
          >
            Waitlist
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
