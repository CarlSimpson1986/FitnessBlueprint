"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSessionRoster, markAttendance, type RosterEntry } from "./actions";

const STATUS_LABEL: Record<RosterEntry["status"], string> = {
  booked: "Booked",
  attended: "Attended",
  no_show: "No-show",
  excused: "Excused",
  cancelled: "Cancelled",
};

export function SessionRoster({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSessionRoster(sessionId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setRoster(result.roster ?? []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleMark(bookingId: string, status: "attended" | "no_show" | "excused") {
    setPendingBookingId(bookingId);
    setError(null);

    const result = await markAttendance(bookingId, status);

    if (result.error) {
      setError(result.error);
    } else {
      setRoster((prev) => prev?.map((entry) => (entry.bookingId === bookingId ? { ...entry, status } : entry)) ?? null);
      router.refresh();
    }

    setPendingBookingId(null);
  }

  if (error && roster === null) {
    return <p className="text-xs text-red-400 px-4 pb-3">{error}</p>;
  }

  if (roster === null) {
    return <p className="text-xs text-blueprint-muted px-4 pb-3">Loading roster…</p>;
  }

  if (roster.length === 0) {
    return <p className="text-xs text-blueprint-muted px-4 pb-3">No one&apos;s booked in yet.</p>;
  }

  return (
    <div className="px-4 pb-4">
      <ul className="space-y-2">
        {roster.map((entry) => (
          <li
            key={entry.bookingId}
            className="flex items-center justify-between gap-3 border-t border-blueprint-line/60 pt-2 first:border-t-0 first:pt-0"
          >
            <span className="text-sm text-blueprint-ink">{entry.memberName}</span>

            {entry.status === "booked" ? (
              <div className="flex gap-1.5">
                {(["attended", "no_show", "excused"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={pendingBookingId === entry.bookingId}
                    onClick={() => handleMark(entry.bookingId, status)}
                    className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-2 py-1 hover:border-blueprint-accent hover:text-blueprint-accent disabled:opacity-50 transition"
                  >
                    {STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">
                {STATUS_LABEL[entry.status]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
