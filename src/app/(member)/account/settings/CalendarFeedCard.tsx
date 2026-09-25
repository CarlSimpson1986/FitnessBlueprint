"use client";

import { useState, useTransition } from "react";
import { getCalendarFeedUrl, resetCalendarFeedUrl } from "./calendar-actions";

/**
 * Private calendar subscription link — members get their bookings, the
 * owner gets every session plus coach time off (src/lib/calendar-feed.ts).
 */
export function CalendarFeedCard({ isOwner }: { isOwner: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const run = (action: typeof getCalendarFeedUrl) =>
    startTransition(async () => {
      setError(null);
      setCopied(false);
      const result = await action();
      if (result.error) setError(result.error);
      else if (result.url) setUrl(result.url);
    });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Couldn't copy — select the link and copy it yourself.");
    }
  }

  return (
    <div className="fb-card space-y-3">
      <p className="text-sm text-blueprint-muted leading-relaxed">
        {isOwner
          ? "Every scheduled session (with its coach and how many are booked) and all coach time off, in your own calendar app."
          : "Your booked sessions in your own calendar app — they appear when you book and disappear if you cancel."}
      </p>

      {!url ? (
        <button type="button" disabled={isPending} onClick={() => run(getCalendarFeedUrl)} className="fb-btn-primary text-sm disabled:opacity-50">
          {isPending ? "…" : "Get my calendar link"}
        </button>
      ) : (
        <>
          <p className="font-mono text-xs text-blueprint-ink bg-blueprint-bg border border-blueprint-line rounded px-3 py-2 break-all select-all">{url}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} className="fb-btn-primary text-sm">
              {copied ? "Copied" : "Copy link"}
            </button>
            {confirmReset ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-blueprint-muted">The old link will stop working.</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setConfirmReset(false);
                    run(resetCalendarFeedUrl);
                  }}
                  className="text-red-400"
                >
                  Reset
                </button>
                <button type="button" onClick={() => setConfirmReset(false)} className="text-blueprint-muted">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} className="text-xs text-blueprint-muted hover:text-blueprint-ink">
                Reset link
              </button>
            )}
          </div>
          <div className="text-xs text-blueprint-muted leading-relaxed space-y-1">
            <p>
              <span className="text-blueprint-ink">Google Calendar</span> (on a computer): Other calendars → + → From URL → paste. It
              then shows on your phone too. Google refreshes it every few hours.
            </p>
            <p>
              <span className="text-blueprint-ink">iPhone</span>: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed
              Calendar → paste.
            </p>
            <p>Keep this link private — anyone with it can see these sessions.</p>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
