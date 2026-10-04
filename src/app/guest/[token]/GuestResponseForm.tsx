"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToGuestInvite } from "./actions";
import { GUEST_HEALTH_QUESTIONS } from "@/lib/guest-invites";

const INPUT =
  "w-full bg-blueprint-raised border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent";

export function GuestResponseForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<(boolean | null)[]>(GUEST_HEALTH_QUESTIONS.map(() => null));
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const allAnswered = answers.every((a) => a !== null);
  const anyYes = answers.some((a) => a === true);

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await respondToGuestInvite(
        token,
        accept ? { accept, phone, healthAnyYes: anyYes, healthNotes: notes, consent } : { accept }
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-blueprint-ink font-medium mb-2">Your phone number</p>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="So we can reach you on the day" className={INPUT} />
      </div>

      <div className="space-y-3">
        <p className="text-sm text-blueprint-ink font-medium">A few quick health questions</p>
        {GUEST_HEALTH_QUESTIONS.map((question, i) => (
          <div key={question}>
            <p className="text-sm text-blueprint-muted mb-1.5">{question}</p>
            <div className="flex gap-1.5">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setAnswers((prev) => prev.map((a, j) => (j === i ? value : a)))}
                  className={
                    "flex-1 rounded-lg py-2 text-sm font-medium border transition " +
                    (answers[i] === value
                      ? "bg-blueprint-accent text-blueprint-bg border-blueprint-accent"
                      : "border-blueprint-line text-blueprint-ink hover:border-blueprint-accent")
                  }
                >
                  {value ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}
        {anyYes && (
          <div>
            <p className="text-sm text-blueprint-ink font-medium mb-1.5">Tell us a bit more</p>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="So the coach can adapt the session for you"
              className={INPUT}
            />
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-blueprint-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>
          I&apos;m happy for Fitness Blueprint to keep my answers so the coach can look after me, and I&apos;m taking part at my
          own risk.
        </span>
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={() => respond(true)}
        disabled={isPending || !allAnswered || !consent || !phone.trim() || (anyYes && !notes.trim())}
        className="fb-btn-primary w-full disabled:opacity-50"
      >
        {isPending ? "…" : "Confirm my place"}
      </button>
      <button
        type="button"
        onClick={() => respond(false)}
        disabled={isPending}
        className="w-full text-xs text-blueprint-muted hover:text-blueprint-accent"
      >
        I can&apos;t make it
      </button>
    </div>
  );
}
