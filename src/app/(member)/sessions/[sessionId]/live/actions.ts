"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

export type LogSetInput = {
  setId: string;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
  distanceM: number | null;
};

/**
 * Upserts one round's logged value(s) — members log as they go through the
 * live session, not all at once at the end (see session-template-spec.md).
 * RLS ("members log own exercises" / "members correct own exercise logs",
 * 0015) is what authorizes this; the (set_id, member_id) unique constraint
 * (0020) is what the upsert targets.
 */
export async function logExerciseSet(input: LogSetInput): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  const { error } = await supabase
    .from("exercise_logs")
    .upsert(
      {
        set_id: input.setId,
        exercise_id: input.exerciseId,
        member_id: user.id,
        weight_kg: input.weightKg,
        reps: input.reps,
        time_seconds: input.timeSeconds,
        distance_m: input.distanceM,
      },
      { onConflict: "set_id,member_id" }
    );

  if (error) {
    return { error: error.message };
  }

  return {};
}

/**
 * Self-reports attendance via the mark_self_attended RPC (0018) — the new
 * Start-session -> log -> Finish flow has no coach in the loop, unlike
 * today's roster-only attendance marking. See the migration for why this
 * is safe (scoped to the caller's own booking, only booked -> attended,
 * only once the session has actually started).
 */
export async function finishWorkout(sessionId: string): Promise<ActionResult> {
  const { supabase } = await requireProfile();
  const { error } = await supabase.rpc("mark_self_attended", { p_session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  return {};
}
