"use server";

import { requireProfile } from "@/lib/auth";

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
  classRating: number;
  effortRating: number;
  experienceRating: number;
  comment: string;
}): Promise<SubmitFeedbackResult> {
  const { supabase, user } = await requireProfile();

  for (const rating of [input.classRating, input.effortRating, input.experienceRating]) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { error: "Ratings must be between 1 and 5." };
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
    class_rating: input.classRating,
    effort_rating: input.effortRating,
    experience_rating: input.experienceRating,
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
