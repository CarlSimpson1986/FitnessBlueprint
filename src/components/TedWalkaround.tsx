"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { markTedTourSeen } from "@/app/(member)/ted-tour-actions";

/** `target` matches a `data-tour` attribute (the bottom-nav tabs set one per href). */
type Step = { title: string; body: string; target?: string };

const STEPS: Step[] = [
  {
    title: "Hey, I'm Ted",
    body: "I'll show you round the app real quick — four things to know, then you're set.",
  },
  {
    title: "My bookings",
    body: "Book a session, cancel one, or join the waitlist for a full class — this tab always shows what's coming up for you.",
    target: "/sessions",
  },
  {
    title: "Coach Ted",
    body: "That's me. Ask me anything about training, nutrition, or recovery, any time — I'll always point you back to your coach for anything specific to you.",
    target: "/coach-ted",
  },
  {
    title: "Progress",
    body: "Log your workouts, body metrics, and daily habits here, and set goals with me to check in on every 6 weeks.",
    target: "/progress",
  },
  {
    title: "Profile",
    body: "Account settings, your purchases and credits, and logging out all live here.",
    target: "/account",
  },
];

type Rect = { top: number; left: number; width: number; height: number; viewportHeight: number };

const SPOTLIGHT_PADDING = 6;

/** Tracks the on-screen box of the current step's target, following resizes/scrolls. */
function useTargetRect(target: string | undefined) {
  // Until the new target is measured the previous box is kept, so the
  // spotlight slides from tab to tab instead of flashing back to centre.
  const [measured, setMeasured] = useState<{ target: string; rect: Rect | null } | null>(null);

  useEffect(() => {
    if (!target) return;
    function measure() {
      const el = document.querySelector(`[data-tour="${target}"]`);
      const r = el?.getBoundingClientRect();
      setMeasured({
        target: target!,
        rect: r
          ? {
              top: r.top - SPOTLIGHT_PADDING,
              left: r.left - SPOTLIGHT_PADDING,
              width: r.width + SPOTLIGHT_PADDING * 2,
              height: r.height + SPOTLIGHT_PADDING * 2,
              viewportHeight: window.innerHeight,
            }
          : null,
      });
    }
    // Measured in a frame callback rather than synchronously in the effect.
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target]);

  return target ? (measured?.rect ?? null) : null;
}

export function TedWalkaround() {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(0);
  const current = STEPS[step]!;
  const rect = useTargetRect(current.target);

  if (dismissed) return null;

  const isLast = step === STEPS.length - 1;

  function finish() {
    setDismissed(true);
    // Fire-and-forget — the tour is already gone from the member's
    // screen; if this fails they just see it once more next login,
    // which is harmless.
    void markTedTourSeen();
  }

  // With a target, the card sits just above it (the nav is at the bottom)
  // with a caret pointing at the highlighted tab; without one it's centred.
  const caretLeft = rect ? rect.left + rect.width / 2 : null;

  return (
    <div className="fixed inset-0 z-50">
      {rect ? (
        <>
          {/* Click-catcher so the page underneath can't be used mid-tour. */}
          <div className="absolute inset-0" />
          {/* The spotlight: a clear window over the target, everything else dimmed. */}
          <div
            className="absolute rounded-xl transition-all duration-300 ease-out pointer-events-none"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.78)",
            }}
          >
            {/* Pulse only the ring — pulsing the whole element would flicker the dimmed backdrop. */}
            <div className="absolute inset-0 rounded-xl ring-2 ring-blueprint-accent animate-pulse" />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 bg-black/80" />
      )}

      <div
        className={
          "absolute left-0 right-0 flex justify-center px-5 transition-all duration-300 " +
          (rect ? "" : "top-1/2 -translate-y-1/2")
        }
        style={rect ? { bottom: rect.viewportHeight - rect.top + 14 } : undefined}
      >
        <div className="relative max-w-sm w-full bg-blueprint-raised border border-blueprint-line rounded-xl p-6 shadow-2xl">
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
                onClick={() => {
                  if (!isLast) {
                    setStep((s) => s + 1);
                    return;
                  }
                  // Straight into Ted's goal wizard — /goals opens it
                  // automatically when the member has no active goal.
                  finish();
                  router.push("/goals");
                }}
                className="fb-btn-primary px-5 py-2 text-sm"
              >
                {isLast ? "Set my first goal" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {caretLeft !== null && rect && (
        <div
          className="absolute h-3 w-3 rotate-45 bg-blueprint-raised border-r border-b border-blueprint-line transition-all duration-300"
          style={{ left: caretLeft - 6, top: rect.top - 14 - 7 }}
        />
      )}
    </div>
  );
}
