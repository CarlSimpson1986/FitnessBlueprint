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
