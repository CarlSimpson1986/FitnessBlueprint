import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { toIntensityType, type SegmentDraft } from "@/lib/workout-content";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * One session's workout (segments → exercises → sets) in the builder's
 * shape. Used by the session builder page and the Today page. Readable by
 * any signed-in user ("session_segments/exercises/exercise_sets: read",
 * 0046) — members see the workout ahead of their class.
 */
export async function loadSessionWorkout(supabase: ServerClient, sessionId: string): Promise<SegmentDraft[]> {
  const { data: segments } = await supabase
    .from("session_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order");

  const segmentIds = (segments ?? []).map((s) => s.id);
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("id, segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order")
    .in("segment_id", segmentIds.length > 0 ? segmentIds : [""])
    .order("sort_order");

  const exerciseIds = (exercises ?? []).map((e) => e.id);
  const { data: sets } = await supabase
    .from("session_exercise_sets")
    .select("id, exercise_id, target, rest_seconds, intensity_type, intensity_value, sort_order")
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : [""])
    .order("sort_order");

  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets ?? []) {
    const list = setsByExercise.get(set.exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.exercise_id, list);
  }

  const exercisesBySegment = new Map<string, typeof exercises>();
  for (const exercise of exercises ?? []) {
    const list = exercisesBySegment.get(exercise.segment_id) ?? [];
    list.push(exercise);
    exercisesBySegment.set(exercise.segment_id, list);
  }

  return (segments ?? []).map((segment) => ({
    key: segment.id,
    type: segment.type,
    label: segment.label ?? "",
    defaultRounds: segment.default_rounds,
    exercises: (exercisesBySegment.get(segment.id) ?? []).map((exercise) => ({
      key: exercise.id,
      name: exercise.name,
      metricType: exercise.metric_type,
      eachSide: exercise.each_side,
      tempo: exercise.tempo ?? "",
      note: exercise.note ?? "",
      videoUrl: exercise.video_url ?? "",
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        key: set.id,
        target: set.target ?? "",
        restSeconds: set.rest_seconds,
        intensityType: toIntensityType(set.intensity_type),
        intensityValue: set.intensity_value,
      })),
    })),
  }));
}
