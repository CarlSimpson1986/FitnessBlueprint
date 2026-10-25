import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { type SegmentDraft } from "@/lib/workout-content";
import { userFacingError } from "@/lib/user-facing-error";
import { loadWorkoutDrafts } from "@/lib/workout-store";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * One session's workout in the builder's shape. Used by the session
 * builder page and the Today page. Readable by any signed-in user
 * ("session_segments/exercises/exercise_sets: read", 0046) — members see
 * the workout ahead of their class.
 */
export async function loadSessionWorkout(supabase: ServerClient, sessionId: string): Promise<SegmentDraft[]> {
  return loadWorkoutDrafts(supabase, "session", sessionId);
}

/**
 * An error if members have logged sets or scores against this class
 * (session_has_logs, 0066): replacing its workout deletes its exercises,
 * and with them (on delete cascade, 0015 / 0066) what members logged.
 */
export async function refuseIfLogged(supabase: ServerClient, sessionId: string): Promise<{ error: string } | null> {
  const { data: logged, error } = await supabase.rpc("session_has_logs", { p_session: sessionId });
  if (error) return { error: userFacingError(error) };
  return logged
    ? { error: "Members have already logged this class, so its workout can't be replaced: that would delete what they logged." }
    : null;
}
