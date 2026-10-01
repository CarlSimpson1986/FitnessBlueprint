"use server";

import { requireProfile } from "@/lib/auth";
import { FEEDBACK_QUESTIONS, type FeedbackRatings } from "@/lib/session-feedback";

export type SubmitFeedbackResult = { error?: string; alreadySubmitted?: boolean };

/**
 * session_feedback has no select policy for members (see
 * supabase/migrations/0002_rls_policies.sql — deliberate, owner-only reads),
 * so there's no way to check for a prior submission before inserting.
 * The unique(session_id, member_id) constraint is the actual guard; a
 * 23505 here just means they've already rated this session, which the
 * caller treats the same as success.
 */
export async function submitFeedback(input: {
  sessionId: string;
  ratings: FeedbackRatings;
  comment: string;
}): Promise<SubmitFeedbackResult> {
  const { supabase, user } = await requireProfile();

  for (const q of FEEDBACK_QUESTIONS) {
    const rating = input.ratings[q.key];
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { error: "Please answer all four questions (1 to 5)." };
    }
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("member_id", user.id)
    .eq("status", "attended")
    .maybeSingle();

  if (bookingError) {
    return { error: bookingError.message };
  }

  if (!booking) {
    return { error: "You can only rate sessions you attended." };
  }

  const { error } = await supabase.from("session_feedback").insert({
    session_id: input.sessionId,
    member_id: user.id,
    coach_rating: input.ratings.coach,
    class_rating: input.ratings.content,
    effort_rating: input.ratings.performance,
    feeling_rating: input.ratings.feeling,
    comment: input.comment.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { alreadySubmitted: true };
    }
    return { error: error.message };
  }

  return {};
}
