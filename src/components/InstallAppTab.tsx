"use client";

import { useState, useSyncExternalStore } from "react";
import { isIos, isRunningInstalled, promptInstall, subscribeInstallState } from "@/lib/install-prompt";

/**
 * "Get app" tab for the bottom nav. Hidden when already running as the
 * installed app. Uses the browser's own install dialog where one exists
 * (Chrome/Android), otherwise shows add-to-home-screen steps.
 */
export function InstallAppTab() {
  // Server snapshot = "installed" so the tab never flashes in the installed app.
  const installed = useSyncExternalStore(subscribeInstallState, isRunningInstalled, () => true);
  const [showSteps, setShowSteps] = useState(false);

  if (installed) return null;

  async function handleClick() {
    const prompted = await promptInstall();
    if (!prompted) setShowSteps(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="flex flex-col items-center gap-1 px-3 text-blueprint-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
          <path d="M12 3v12" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        <span className="text-[10px]">Get app</span>
      </button>

      {showSteps && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-8"
          onClick={() => setShowSteps(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-sm w-full bg-blueprint-raised border border-blueprint-line rounded-xl p-5 shadow-2xl"
          >
            <p className="text-lg font-semibold text-blueprint-ink mb-3">Add Fitness Blueprint to your home screen</p>
            {isIos() ? (
              <ol className="text-sm text-blueprint-muted space-y-2 list-decimal pl-5 mb-5">
                <li>
                  Open this page in <span className="text-blueprint-ink">Safari</span>.
                </li>
                <li>
                  Tap the <span className="text-blueprint-ink">Share</span> button (the square with an arrow).
                </li>
                <li>
                  Choose <span className="text-blueprint-ink">Add to Home Screen</span>, then tap Add.
                </li>
              </ol>
            ) : (
              <ol className="text-sm text-blueprint-muted space-y-2 list-decimal pl-5 mb-5">
                <li>
                  Open your browser menu (<span className="text-blueprint-ink">⋮</span>, top right).
                </li>
                <li>
                  Tap <span className="text-blueprint-ink">Install app</span> or{" "}
                  <span className="text-blueprint-ink">Add to Home screen</span>.
                </li>
              </ol>
            )}
            <button type="button" onClick={() => setShowSteps(false)} className="fb-btn-primary w-full text-sm">
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
