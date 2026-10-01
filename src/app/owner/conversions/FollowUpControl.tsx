"use client";

import { useState, useTransition } from "react";
import { FOLLOW_UP_LABEL, FOLLOW_UP_STATUSES, type FollowUp, type FollowUpStatus } from "@/lib/conversions";
import { saveFollowUp } from "./actions";

/** "Have we had the what-next chat?" — status, optional date and note, per programme. */
export function FollowUpControl({
  membershipId,
  memberId,
  followUp,
}: {
  membershipId: string;
  memberId: string;
  followUp: FollowUp | null;
}) {
  const [status, setStatus] = useState<FollowUpStatus | "none">(followUp?.status ?? "none");
  const [followUpOn, setFollowUpOn] = useState(followUp?.followUpOn ?? "");
  const [note, setNote] = useState(followUp?.note ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; saved?: boolean } | null>(null);

  const dirty =
    status !== (followUp?.status ?? "none") ||
    followUpOn !== (followUp?.followUpOn ?? "") ||
    note !== (followUp?.note ?? "");

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveFollowUp({
        membershipId,
        memberId,
        status: status === "none" ? null : status,
        followUpOn: status === "follow_up" ? followUpOn : null,
        note: status === "none" ? "" : note,
      });
      setMessage(result.error ? { error: result.error } : { saved: true });
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as FollowUpStatus | "none")}
        className="text-xs bg-transparent border border-blueprint-line rounded px-2 py-1.5 text-blueprint-ink"
        aria-label="Follow-up status"
      >
        {(["none", ...FOLLOW_UP_STATUSES] as const).map((s) => (
          <option key={s} value={s} className="bg-blueprint-raised">
            {FOLLOW_UP_LABEL[s]}
          </option>
        ))}
      </select>
      {status === "follow_up" && (
        <input
          type="date"
          value={followUpOn}
          onChange={(e) => setFollowUpOn(e.target.value)}
          className="text-xs bg-transparent border border-blueprint-line rounded px-2 py-1.5 text-blueprint-ink"
          aria-label="Follow up on"
        />
      )}
      {status !== "none" && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="flex-1 min-w-[10rem] text-xs bg-transparent border border-blueprint-line rounded px-2 py-1.5 text-blueprint-ink placeholder:text-blueprint-muted"
        />
      )}
      {dirty && (
        <button type="button" onClick={handleSave} disabled={isPending} className="fb-btn-primary text-xs disabled:opacity-50">
          {isPending ? "Saving…" : "Save"}
        </button>
      )}
      {message?.saved && !dirty && <span className="text-xs text-blueprint-accent">Saved</span>}
      {message?.error && <span className="text-xs text-red-400">{message.error}</span>}
    </div>
  );
}
