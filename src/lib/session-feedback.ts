/**
 * The four rate-the-class questions (0035). One list drives both member
 * rating forms, the server-side validation, the owner's Feedback page and
 * Ted's weekly averages, so a question can't be added in one place and
 * missed in another.
 *
 * `column` is the session_feedback column each answer lands in —
 * class_rating and effort_rating predate these wordings (see 0035).
 */
export const FEEDBACK_QUESTIONS = [
  { key: "coach", column: "coach_rating", label: "How was your coach?", shortLabel: "Coach" },
  { key: "content", column: "class_rating", label: "How was the session content?", shortLabel: "Content" },
  { key: "performance", column: "effort_rating", label: "How did you perform?", shortLabel: "Performance" },
  { key: "feeling", column: "feeling_rating", label: "How are you feeling now?", shortLabel: "Feeling after" },
] as const;

export type FeedbackQuestionKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];
export type FeedbackColumn = (typeof FEEDBACK_QUESTIONS)[number]["column"];

/** 0 = not answered yet. */
export type FeedbackRatings = Record<FeedbackQuestionKey, number>;

export const EMPTY_RATINGS: FeedbackRatings = { coach: 0, content: 0, performance: 0, feeling: 0 };

export function allRated(ratings: FeedbackRatings): boolean {
  return FEEDBACK_QUESTIONS.every((q) => ratings[q.key] > 0);
}

/** "coach 4.6 · content 4.2 · …" — only the questions that have an average. */
export function formatRatingAverages(averages: Partial<Record<FeedbackQuestionKey, number>>): string {
  return FEEDBACK_QUESTIONS.filter((q) => averages[q.key] !== undefined)
    .map((q) => `${q.shortLabel.toLowerCase()} ${averages[q.key]}`)
    .join(" · ");
}
