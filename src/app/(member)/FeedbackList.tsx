"use client";

import { useEffect, useState } from "react";
import { SessionRatingQuestions } from "@/components/SessionRatingQuestions";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { loadRatedSessions, markSessionRated } from "@/lib/rated-sessions";
import { EMPTY_RATINGS, allRated, type FeedbackRatings } from "@/lib/session-feedback";
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


function FeedbackCard({ item, onDone }: { item: FeedbackItem; onDone: () => void }) {
  const [ratings, setRatings] = useState<FeedbackRatings>(EMPTY_RATINGS);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = allRated(ratings) && !isSubmitting;

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await submitFeedback({
        sessionId: item.sessionId,
        ratings,
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

      <div className="mb-3">
        <SessionRatingQuestions ratings={ratings} onChange={setRatings} />
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
