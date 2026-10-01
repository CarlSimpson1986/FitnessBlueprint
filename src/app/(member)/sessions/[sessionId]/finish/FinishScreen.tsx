"use client";

import { useState } from "react";
import Link from "next/link";
import { SessionRatingQuestions } from "@/components/SessionRatingQuestions";
import { markSessionRated } from "@/lib/rated-sessions";
import { EMPTY_RATINGS, allRated, type FeedbackRatings } from "@/lib/session-feedback";
import { submitFeedback } from "../../../feedback-actions";


export function FinishScreen({
  sessionId,
  className,
  durationMinutes,
  coachName,
  totalKg,
  horses,
}: {
  sessionId: string;
  className: string;
  durationMinutes: number;
  coachName: string;
  totalKg: number;
  horses: number;
}) {
  const [ratings, setRatings] = useState<FeedbackRatings>(EMPTY_RATINGS);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = allRated(ratings) && !isSubmitting;

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    const result = await submitFeedback({
      sessionId,
      ratings,
      comment,
    });

    if (result.error) {
      setError(result.error);
    } else {
      markSessionRated(sessionId);
      setDone(true);
    }

    setIsSubmitting(false);
  }

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-4">
          <p className="text-3xl mb-2">🏁</p>
          <p className="text-xl font-semibold text-blueprint-ink">Session complete</p>
          <p className="text-xs text-blueprint-muted mt-1">
            {className} · {durationMinutes} min · with {coachName}
          </p>
        </div>

        {totalKg > 0 && (
          <div className="fb-card-accent text-center mb-4">
            <p className="text-2xl mb-1">{"🐴".repeat(Math.min(horses, 10))}</p>
            <p className="text-blueprint-ink font-medium">
              Well done — you shifted {Math.round(totalKg).toLocaleString()}kg today
            </p>
            <p className="text-xs text-blueprint-muted mt-1">
              That&apos;s roughly {horses} horse{horses === 1 ? "" : "s"}. {coachName.split(" ")[0]}&apos;s impressed.
            </p>
          </div>
        )}

        {done ? (
          <div className="fb-card text-center">
            <p className="text-blueprint-ink">Thanks — saved.</p>
            <Link href="/" className="fb-btn-primary inline-block mt-3">
              Back to Home
            </Link>
          </div>
        ) : (
          <div className="fb-card">
            <p className="text-sm text-blueprint-muted text-center mb-3">How was it?</p>
            <div className="mb-3">
              <SessionRatingQuestions ratings={ratings} onChange={setRatings} />
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (optional)"
              rows={2}
              className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted mb-3 resize-none"
            />
            {!canSubmit && (
              <p className="text-xs text-blueprint-muted text-center mb-2">Answer all four to submit</p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="fb-btn-primary w-full disabled:opacity-50"
            >
              {isSubmitting ? "…" : "Save and finish"}
            </button>
            {error && <p className="text-xs text-red-400 mt-2 text-center">{error}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
