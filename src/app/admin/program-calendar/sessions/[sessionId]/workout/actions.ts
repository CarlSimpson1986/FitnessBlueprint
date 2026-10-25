"use server";

import { requireOwner } from "@/lib/auth";
import { type SegmentInput } from "@/lib/workout-content";
import { saveWorkoutTemplate } from "@/app/admin/workout-templates/actions";
import { refuseIfLogged } from "@/lib/session-workout";
import { userFacingError } from "@/lib/user-facing-error";
import { insertWorkout, loadWorkout, workoutProblem } from "@/lib/workout-store";

export type ActionResult = { error?: string };

/**
 * Full-replace save: whether Guy built this from scratch or a template was
 * just assigned onto this session from the program calendar (0019,
 * copy-on-assign — see src/app/admin/program-calendar), "this is the whole
 * workout now" is simpler and safer than diffing against what's there.
 * Deleting session_segments cascades to session_exercises (FK on delete
 * cascade, 0015) — RLS ("owner manages session segments", 0024)
 * is what actually authorizes this, no admin client needed.
 */
export async function saveSessionWorkout(sessionId: string, segments: SegmentInput[]): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  const problem = workoutProblem(segments);
  if (problem) return { error: problem };

  // Saving replaces the workout, and deleting its exercises deletes the
  // sets and scores members logged against them (on delete cascade, 0015 /
  // 0066). The copy functions already skip logged classes; so does this.
  const blocked = await refuseIfLogged(supabase, sessionId);
  if (blocked) return blocked;

  const { error: deleteError } = await supabase
    .from("session_segments")
    .delete()
    .eq("session_id", sessionId);

  if (deleteError) {
    return { error: userFacingError(deleteError) };
  }

  return insertWorkout(supabase, "session", sessionId, segments);
}

/**
 * Pastes a copied session onto another day — the calendar's Everfit-style
 * copy/paste. If that day already has the same class at the same time
 * scheduled, the workout goes onto it (replacing whatever was there);
 * otherwise a new session is scheduled with the source's class, coach,
 * time, duration and capacity, then the workout is copied onto it.
 * Either way it's a real, independent copy — editing it afterward never
 * touches the source.
 *
 * RLS: "owner manages sessions" (0024) authorizes the insert,
 * and the session_segments/exercises/sets "owner manages ..."
 * policies (0024) authorize the workout write — no admin client.
 */
export async function pasteSessionToDate(sourceSessionId: string, dateKey: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  const { data: source, error: sourceError } = await supabase
    .from("sessions")
    .select("id, template_id, coach_id, session_date, start_time, duration_minutes, capacity")
    .eq("id", sourceSessionId)
    .maybeSingle();

  if (sourceError || !source) {
    return { error: "Couldn't find the session you copied." };
  }
  if (source.session_date === dateKey) {
    return { error: "That's the day you copied from." };
  }

  const workout = await loadWorkout(supabase, "session", sourceSessionId);
  if (workout.error || !workout.segments) {
    return { error: workout.error ?? "Could not read that workout." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("sessions")
    .select("id")
    .eq("session_date", dateKey)
    .eq("template_id", source.template_id)
    .eq("start_time", source.start_time)
    .eq("status", "scheduled")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { error: userFacingError(existingError) };
  }

  if (existing) {
    if (workout.segments.length === 0) {
      return { error: "That class is already scheduled there." };
    }
    return saveSessionWorkout(existing.id, workout.segments);
  }

  const { data: created, error: insertError } = await supabase
    .from("sessions")
    .insert({
      template_id: source.template_id,
      coach_id: source.coach_id,
      session_date: dateKey,
      start_time: source.start_time,
      duration_minutes: source.duration_minutes,
      capacity: source.capacity,
      status: "scheduled",
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return { error: userFacingError(insertError, "Could not schedule the session.") };
  }

  if (workout.segments.length === 0) {
    return {};
  }

  const result = await saveSessionWorkout(created.id, workout.segments);
  if (result.error) {
    // Don't leave an empty session behind that the coach didn't ask for.
    await supabase.from("sessions").delete().eq("id", created.id);
  }
  return result;
}

/**
 * "Save workout to library" — turns a session's workout into a named
 * workout_template (independent copy, via saveWorkoutTemplate).
 */
export async function saveSessionWorkoutToLibrary(sessionId: string, name: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  const workout = await loadWorkout(supabase, "session", sessionId);
  if (workout.error || !workout.segments) {
    return { error: workout.error ?? "Could not read that workout." };
  }
  if (workout.segments.length === 0) {
    return { error: "That session has no workout yet." };
  }

  const result = await saveWorkoutTemplate(name, workout.segments);
  return result.error ? { error: result.error } : {};
}

export type PasteWeekResult = ActionResult & { copied?: number; kept?: number; noClass?: number };

/**
 * "Copy week" (Guy, 2026-10-14): one week's class workouts onto the same
 * class (weekday, class type, start time) in each target week. Week starts
 * are Mondays (YYYY-MM-DD). All the work is copy_week_workouts (0063) —
 * one transaction, so a 10-week block can't half-copy or time out. It runs
 * as the caller: the owner-only session_segments/exercises/exercise_sets
 * write policies (0046) authorize it.
 */
export async function pasteWeekWorkouts(
  sourceWeekStart: string,
  targetWeekStarts: string[],
  replace: boolean
): Promise<PasteWeekResult> {
  const { supabase } = await requireOwner();

  const targets = [...new Set(targetWeekStarts)].filter((w) => w !== sourceWeekStart);
  if (targets.length === 0) {
    return { error: "Pick at least one other week to paste into." };
  }

  const { data, error } = await supabase.rpc("copy_week_workouts", {
    p_source_week: sourceWeekStart,
    p_target_weeks: targets,
    p_replace: replace,
  });

  if (error) {
    return { error: userFacingError(error) };
  }

  const counts = data?.[0];
  if (!counts || counts.copied + counts.kept + counts.no_class === 0) {
    return { error: "That week has no workouts to copy yet." };
  }
  return { copied: counts.copied, kept: counts.kept, noClass: counts.no_class };
}

export type CopyForwardResult = ActionResult & { copied?: number; kept?: number };

/**
 * "This and every later Tuesday 06:00" (Guy, 2026-10-20): this class's
 * workout onto every later class of the same type, weekday and time. All
 * the work is copy_workout_forward (0064) — one transaction, same rules as
 * Copy week: runs as the caller, so the owner-only session_segments/
 * exercises/exercise_sets write policies (0046) authorize it, and a class
 * members have already logged against is kept, not replaced.
 */
export async function copyWorkoutForward(sessionId: string): Promise<CopyForwardResult> {
  const { supabase } = await requireOwner();

  const { data, error } = await supabase.rpc("copy_workout_forward", { p_source_session: sessionId });
  if (error) {
    return { error: userFacingError(error) };
  }

  const counts = data?.[0];
  return { copied: counts?.copied ?? 0, kept: counts?.kept ?? 0 };
}

export type CopySameDayResult = ActionResult & { copied?: number; kept?: number; copiedIds?: string[] };

/**
 * "Every GCP class this Monday" (Guy, 2026-10-24): this class's workout
 * onto every other class of the same type that date. All the work is
 * copy_workout_same_day (0065) — same rules and same policies as
 * copyWorkoutForward. Returns the classes copied to, so the builder can
 * run "and every later" from each of them as well.
 */
export async function copyWorkoutSameDay(sessionId: string): Promise<CopySameDayResult> {
  const { supabase } = await requireOwner();

  const { data, error } = await supabase.rpc("copy_workout_same_day", { p_source_session: sessionId });
  if (error) {
    return { error: userFacingError(error) };
  }

  const counts = data?.[0];
  return { copied: counts?.copied ?? 0, kept: counts?.kept ?? 0, copiedIds: counts?.copied_ids ?? [] };
}
