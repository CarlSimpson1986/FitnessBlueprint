"use client";

import { useState, type ReactNode } from "react";

/**
 * Both tabs' content are rendered server-side and passed in as ReactNode —
 * this just toggles visibility client-side (display:none, not unmount) so
 * nested client components like WaitlistPanel/BuddyInvitePanel don't lose
 * their local state on switch.
 */
export function BookingsTabs({ myBookings, schedule }: { myBookings: ReactNode; schedule: ReactNode }) {
  const [tab, setTab] = useState<"mine" | "schedule">("mine");

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={
            tab === "mine"
              ? "flex-1 text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 transition"
              : "flex-1 text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-blueprint-accent transition"
          }
        >
          My bookings
        </button>
        <button
          type="button"
          onClick={() => setTab("schedule")}
          className={
            tab === "schedule"
              ? "flex-1 text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 transition"
              : "flex-1 text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-2 hover:border-blueprint-accent transition"
          }
        >
          Schedule
        </button>
      </div>

      <div style={{ display: tab === "mine" ? "block" : "none" }}>{myBookings}</div>
      <div style={{ display: tab === "schedule" ? "block" : "none" }}>{schedule}</div>
    </div>
  );
}
