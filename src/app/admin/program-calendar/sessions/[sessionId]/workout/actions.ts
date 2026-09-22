"use server";

import { requireCoachOrOwner } from "@/lib/auth";
import type { SegmentInput } from "@/lib/workout-content";

export type ActionResult = { error?: string };

/**
 * Full-replace save: whether Guy built this from scratch or a template was
 * just assigned onto this session from the program calendar (0019,
 * copy-on-assign — see src/app/admin/program-calendar), "this is the whole
 * workout now" is simpler and safer than diffing against what's there.
 * Deleting session_segments cascades to session_exercises (FK on delete
 * cascade, 0015) — RLS ("coaches and owner manage session segments", 0015)
 * is what actually authorizes this, no admin client needed.
 */
export async function saveSessionWorkout(sessionId: string, segments: SegmentInput[]): Promise<ActionResult> {
  const { supabase } = await requireCoachOrOwner();

  if (segments.length === 0) {
    return { error: "Add at least one segment." };
  }
  for (const segment of segments) {
    if (segment.exercises.length === 0) {
      return { error: "Every segment needs at least one exercise." };
    }
    for (const exercise of segment.exercises) {
      if (!exercise.name.trim()) {
        return { error: "Every exercise needs a name." };
      }
      if (exercise.sets.length === 0) {
        return { error: "Every exercise needs at least one set." };
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("session_segments")
    .delete()
    .eq("session_id", sessionId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  for (const [i, segment] of segments.entries()) {
    const { data: insertedSegment, error: segmentError } = await supabase
      .from("session_segments")
      .insert({
        session_id: sessionId,
        type: segment.type,
        label: segment.label?.trim() || null,
        default_rounds: segment.defaultRounds,
        sort_order: i,
      })
      .select("id")
      .single();

    if (segmentError || !insertedSegment) {
      return { error: segmentError?.message ?? "Could not save segment." };
    }

    for (const [j, exercise] of segment.exercises.entries()) {
      const { data: insertedExercise, error: exerciseError } = await supabase
        .from("session_exercises")
        .insert({
          segment_id: insertedSegment.id,
          name: exercise.name.trim(),
          metric_type: exercise.metricType,
          each_side: exercise.eachSide,
          tempo: exercise.tempo?.trim() || null,
          note: exercise.note?.trim() || null,
          video_url: exercise.videoUrl?.trim() || null,
          sort_order: j,
        })
        .select("id")
        .single();

      if (exerciseError || !insertedExercise) {
        return { error: exerciseError?.message ?? "Could not save exercise." };
      }

      const setRows = exercise.sets.map((set, k) => ({
        exercise_id: insertedExercise.id,
        set_number: k + 1,
        target: set.target?.trim() || null,
        rest_seconds: set.restSeconds,
        sort_order: k,
      }));

      const { error: setsError } = await supabase.from("session_exercise_sets").insert(setRows);
      if (setsError) {
        return { error: setsError.message };
      }
    }
  }

  return {};
}

/**
 * Copies sourceSessionId's current workout onto targetSessionId — a
 * real, independent copy (delegates to saveSessionWorkout's existing
 * full-replace insert, same as assigning a workout_template does), not
 * a live reference. Editing the target afterward via the normal
 * builder never touches the source. Lets a coach reuse "Tuesday's
 * session" on a different date without saving it as a named template
 * first.
 */
export async function copySessionWorkout(sourceSessionId: string, targetSessionId: string): Promise<ActionResult> {
  const { supabase } = await requireCoachOrOwner();

  const { data: segments, error: segmentsError } = await supabase
    .from("session_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("session_id", sourceSessionId)
    .order("sort_order");

  if (segmentsError) {
    return { error: segmentsError.message };
  }

  const segmentRows = segments ?? [];
  if (segmentRows.length === 0) {
    return { error: "That session has no workout content yet." };
  }

  const { data: exercises, error: exercisesError } = await supabase
    .from("session_exercises")
    .select("id, segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order")
    .in("segment_id", segmentRows.map((s) => s.id))
    .order("sort_order");

  if (exercisesError) {
    return { error: exercisesError.message };
  }

  const exerciseRows = exercises ?? [];
  const { data: sets, error: setsError } = await supabase
    .from("session_exercise_sets")
    .select("exercise_id, target, rest_seconds, sort_order")
    .in("exercise_id", exerciseRows.map((e) => e.id))
    .order("sort_order");

  if (setsError) {
    return { error: setsError.message };
  }

  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets ?? []) {
    const list = setsByExercise.get(set.exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.exercise_id, list);
  }

  const exercisesBySegment = new Map<string, typeof exerciseRows>();
  for (const exercise of exerciseRows) {
    const list = exercisesBySegment.get(exercise.segment_id) ?? [];
    list.push(exercise);
    exercisesBySegment.set(exercise.segment_id, list);
  }

  const segmentInputs: SegmentInput[] = segmentRows.map((segment) => ({
    type: segment.type,
    label: segment.label,
    defaultRounds: segment.default_rounds,
    exercises: (exercisesBySegment.get(segment.id) ?? []).map((exercise) => ({
      name: exercise.name,
      metricType: exercise.metric_type,
      eachSide: exercise.each_side,
      tempo: exercise.tempo,
      note: exercise.note,
      videoUrl: exercise.video_url,
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        target: set.target,
        restSeconds: set.rest_seconds,
      })),
    })),
  }));

  return saveSessionWorkout(targetSessionId, segmentInputs);
}
