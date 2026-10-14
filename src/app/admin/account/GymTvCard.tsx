"use client";

import { useState, useTransition } from "react";
import { getGymTvUrl, resetGymTvUrl } from "./gym-tv-actions";

/**
 * The gym TV link (0062) — open it once on the TV and leave it. Same
 * get / copy / reset shape as CalendarFeedCard.
 */
export function GymTvCard() {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const run = (action: typeof getGymTvUrl) =>
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
        Today&apos;s class workout on the gym TV, in landscape. It moves on to the next class 5 minutes before it starts
        and picks up any changes within a minute.
      </p>

      {!url ? (
        <button type="button" disabled={isPending} onClick={() => run(getGymTvUrl)} className="fb-btn-primary text-sm disabled:opacity-50">
          {isPending ? "…" : "Get the TV link"}
        </button>
      ) : (
        <>
          <p className="font-mono text-xs text-blueprint-ink bg-blueprint-bg border border-blueprint-line rounded px-3 py-2 break-all select-all">{url}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} className="fb-btn-primary text-sm">
              {copied ? "Copied" : "Copy link"}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-blueprint-accent underline">
              Open
            </a>
            {confirmReset ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-blueprint-muted">The TV will need the new link.</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setConfirmReset(false);
                    run(resetGymTvUrl);
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
            <p>Open it in the TV&apos;s browser once and bookmark it. If it ever looks stuck, reload the page.</p>
            <p>
              Anyone with the link can see today&apos;s workouts (no member names). If it gets out, reset it and put the new
              one on the TV.
            </p>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
