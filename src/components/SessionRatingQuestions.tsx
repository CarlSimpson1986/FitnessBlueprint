"use client";

import { FEEDBACK_QUESTIONS, type FeedbackRatings } from "@/lib/session-feedback";

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
      <div className="flex gap-1 shrink-0">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} out of 5`}
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

/** The four 1–5 rate-the-class questions, used by both member rating forms. */
export function SessionRatingQuestions({
  ratings,
  onChange,
}: {
  ratings: FeedbackRatings;
  onChange: (ratings: FeedbackRatings) => void;
}) {
  return (
    <div className="space-y-2">
      {FEEDBACK_QUESTIONS.map((q) => (
        <RatingPicker
          key={q.key}
          label={q.label}
          value={ratings[q.key]}
          onChange={(value) => onChange({ ...ratings, [q.key]: value })}
        />
      ))}
    </div>
  );
}
