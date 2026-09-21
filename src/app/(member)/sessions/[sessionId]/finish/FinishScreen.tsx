"use client";

import { useState } from "react";
import Link from "next/link";
import { markSessionRated } from "@/lib/rated-sessions";
import { submitFeedback } from "../../../feedback-actions";

function RatingPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-blueprint-muted">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={
              n <= value
                ? "w-7 h-7 text-xs rounded border border-blueprint-accent bg-blueprint-accent text-black transition"
                : "w-7 h-7 text-xs rounded border border-blueprint-line text-blueprint-muted hover:border-blueprint-accent transition"
            }
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [classRating, setClassRating] = useState(0);
  const [effortRating, setEffortRating] = useState(0);
  const [experienceRating, setExperienceRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = classRating > 0 && effortRating > 0 && experienceRating > 0 && !isSubmitting;

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    const result = await submitFeedback({
      sessionId,
      classRating,
      effortRating,
      experienceRating,
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
            <div className="space-y-2 mb-3">
              <RatingPicker label="Class" value={classRating} onChange={setClassRating} />
              <RatingPicker label="Effort" value={effortRating} onChange={setEffortRating} />
              <RatingPicker label="Experience" value={experienceRating} onChange={setExperienceRating} />
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment (optional)"
              rows={2}
              className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted mb-3 resize-none"
            />
            {!canSubmit && (
              <p className="text-xs text-blueprint-muted text-center mb-2">Tap a star to rate the session first</p>
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
