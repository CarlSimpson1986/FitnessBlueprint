"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteBuddy, withdrawBookingInvite } from "./actions";

export type SentInvite = {
  id: string;
  buddyName: string;
  status: "invited" | "cancelled";
};

export function BuddyInvitePanel({
  sessionId,
  sentInvite,
}: {
  sessionId: string;
  sentInvite: SentInvite | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [buddyEmail, setBuddyEmail] = useState("");
  const [showField, setShowField] = useState(false);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleInvite() {
    setError(null);
    startTransition(async () => {
      const result = await inviteBuddy(sessionId, buddyEmail);
      if (result.error) {
        setError(result.error);
      } else {
        setBuddyEmail("");
        setShowField(false);
        refresh();
      }
    });
  }

  function handleWithdraw() {
    if (!sentInvite) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawBookingInvite(sentInvite.id);
      if (result.error) {
        setError(result.error);
      } else {
        refresh();
      }
    });
  }

  if (sentInvite?.status === "invited") {
    return (
      <div className="mt-1 flex flex-col items-end gap-1">
        <p className="text-xs text-blueprint-muted text-right">
          Invited {sentInvite.buddyName} — waiting on them
        </p>
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={isPending}
          className="text-xs text-blueprint-muted hover:text-red-400 disabled:opacity-50 transition"
        >
          Withdraw
        </button>
        {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-1">
      {showField ? (
        <div className="flex flex-col items-end gap-1">
          <input
            type="email"
            value={buddyEmail}
            onChange={(e) => setBuddyEmail(e.target.value)}
            placeholder="Buddy's email"
            className="text-xs bg-transparent border border-blueprint-line rounded-lg px-2 py-1.5 text-blueprint-ink placeholder:text-blueprint-muted w-44 text-right"
          />
          <button
            type="button"
            onClick={handleInvite}
            disabled={isPending}
            className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 transition"
          >
            {isPending ? "…" : "Send invite"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowField(true)}
          className="text-xs text-blueprint-muted hover:text-blueprint-accent transition"
        >
          Invite a buddy
        </button>
      )}
      {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
