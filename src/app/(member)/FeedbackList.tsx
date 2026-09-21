"use client";

import { useEffect, useState } from "react";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { loadRatedSessions, markSessionRated } from "@/lib/rated-sessions";
import { submitFeedback } from "./feedback-actions";

type FeedbackItem = {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  templateName: string;
};

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const [ratedIds, setRatedIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    // One-time client-only localStorage read (no SSR value exists to seed
    // this with) — the resulting extra render is intentional, not the
    // cascading-render pattern this rule otherwise guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRatedIds(loadRatedSessions());
  }, []);

  function markRated(sessionId: string) {
    markSessionRated(sessionId);
    setRatedIds((prev) => {
      const next = new Set(prev ?? []);
      next.add(sessionId);
      return next;
    });
  }

  if (ratedIds === null) {
    return null;
  }

  const pending = items.filter((item) => !ratedIds.has(item.sessionId));

  if (pending.length === 0) {
    return (
      <p className="text-blueprint-muted text-sm">
        Nothing to rate right now — check back after your next session.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {pending.map((item) => (
        <FeedbackCard key={item.sessionId} item={item} onDone={() => markRated(item.sessionId)} />
      ))}
    </ul>
  );
}

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

function FeedbackCard({ item, onDone }: { item: FeedbackItem; onDone: () => void }) {
  const [classRating, setClassRating] = useState(0);
  const [effortRating, setEffortRating] = useState(0);
  const [experienceRating, setExperienceRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = classRating > 0 && effortRating > 0 && experienceRating > 0 && !isSubmitting;

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await submitFeedback({
        sessionId: item.sessionId,
        classRating,
        effortRating,
        experienceRating,
        comment,
      });

      if (result.error) {
        setError(result.error);
      } else {
        onDone();
      }
    } catch {
      setError("Something went wrong — please try again.");
    }

    setIsSubmitting(false);
  }

  return (
    <li className="fb-card">
      <p className="text-blueprint-ink font-medium mb-3">
        {formatSessionDate(item.sessionDate)} · {formatSessionTime(item.startTime)} ·{" "}
        {item.templateName}
      </p>

      <div className="space-y-2 mb-3">
        <RatingPicker label="Class" value={classRating} onChange={setClassRating} />
        <RatingPicker label="Effort" value={effortRating} onChange={setEffortRating} />
        <RatingPicker label="Experience" value={experienceRating} onChange={setExperienceRating} />
      </div>

      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Anything you'd like to add? (optional)"
        rows={2}
        className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted mb-3 resize-none"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="fb-btn-primary disabled:opacity-50"
        >
          {isSubmitting ? "…" : "Submit"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </li>
  );
}
