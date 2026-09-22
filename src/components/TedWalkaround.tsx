"use client";

import { useState } from "react";
import Image from "next/image";
import { markTedTourSeen } from "@/app/(member)/ted-tour-actions";

type Step = { title: string; body: string };

const STEPS: Step[] = [
  {
    title: "Hey, I'm Ted",
    body: "I'll show you round the app real quick — four things to know, then you're set.",
  },
  {
    title: "My bookings",
    body: "Book a session, cancel one, or join the waitlist for a full class — this tab always shows what's coming up for you.",
  },
  {
    title: "Coach Ted",
    body: "That's me. Ask me anything about training, nutrition, or recovery, any time — I'll always point you back to your coach for anything specific to you.",
  },
  {
    title: "Progress",
    body: "Log your workouts, body metrics, and daily habits here, and set goals with me to check in on every 6 weeks.",
  },
  {
    title: "Profile",
    body: "Account settings, your purchases and credits, and logging out all live here.",
  },
];

export function TedWalkaround() {
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);

  if (dismissed) return null;

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step]!;

  function finish() {
    setDismissed(true);
    // Fire-and-forget — the tour is already gone from the member's
    // screen; if this fails they just see it once more next login,
    // which is harmless.
    void markTedTourSeen();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
      <div className="max-w-sm w-full bg-blueprint-bg-raised border border-blueprint-line rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Image
            src="/coach-ted-avatar.png"
            alt=""
            width={40}
            height={40}
            className="rounded-full object-cover shrink-0"
          />
          <h2 className="text-lg font-semibold text-blueprint-ink">{current.title}</h2>
        </div>

        <p className="text-sm text-blueprint-muted leading-relaxed mb-6">{current.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i === step ? "var(--fb-accent)" : "var(--fb-line)" }}
              />
            ))}
          </div>

          <div className="flex items-center gap-4">
            {!isLast && (
              <button
                type="button"
                onClick={finish}
                className="text-xs font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-ink"
              >
                Skip
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              className="fb-btn-primary px-5 py-2 text-sm"
            >
              {isLast ? "Got it, let's go" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
