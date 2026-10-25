import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { userFacingError } from "@/lib/user-facing-error";
import {
  intensityColumns,
  toIntensityType,
  toScoreType,
  type SegmentDraft,
  type SegmentInput,
} from "@/lib/workout-content";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A workout lives in one of two identical table trees: a class's own copy
 * (session_segments → session_exercises → session_exercise_sets, 0015) or
 * a library template (template_segments → …, 0019). Reading, writing and
 * checking a workout is the same for both, so it lives here once instead
 * of in every builder action and page. RLS decides who may do what:
 * reads are open to signed-in users, writes are owner-only (0024, 0046).
 */
export type WorkoutOwner = "session" | "template";

/** Why a workout can't be saved, or null if it can. */
export function workoutProblem(segments: SegmentInput[]): string | null {
  if (segments.length === 0) return "Add at least one segment.";
  for (const segment of segments) {
    if (segment.textContent === null && segment.exercises.length === 0) {
      return "Every segment needs at least one exercise.";
    }
    for (const exercise of segment.exercises) {
      if (!exercise.name.trim()) return "Every exercise needs a name.";
      if (exercise.sets.length === 0) return "Every exercise needs at least one set.";
    }
  }
  return null;
}

async function fetchRows(supabase: ServerClient, owner: WorkoutOwner, id: string) {
  const segmentsQuery =
    owner === "session"
      ? supabase.from("session_segments").select(SEGMENT_COLUMNS).eq("session_id", id)
      : supabase.from("template_segments").select(SEGMENT_COLUMNS).eq("template_id", id);
  const { data: segments, error: segmentsError } = await segmentsQuery.order("sort_order");
  if (segmentsError) return { error: userFacingError(segmentsError) };
  if (segments.length === 0) return { segments, exercises: [], sets: [] };

  const { data: exercises, error: exercisesError } = await supabase
    .from(owner === "session" ? "session_exercises" : "template_exercises")
    .select("id, segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order")
    .in("segment_id", segments.map((s) => s.id))
    .order("sort_order");
  if (exercisesError) return { error: userFacingError(exercisesError) };

  const { data: sets, error: setsError } = await supabase
    .from(owner === "session" ? "session_exercise_sets" : "template_exercise_sets")
    .select("id, exercise_id, target, rest_seconds, intensity_type, intensity_value, sort_order")
    .in("exercise_id", exercises.length > 0 ? exercises.map((e) => e.id) : [""])
    .order("sort_order");
  if (setsError) return { error: userFacingError(setsError) };

  return { segments, exercises, sets };
}

const SEGMENT_COLUMNS = "id, type, label, default_rounds, is_scored, text_content, score_type, sort_order";

type Rows = Exclude<Awaited<ReturnType<typeof fetchRows>>, { error: string }>;

function groupBy<T, K extends keyof T>(rows: T[], key: K) {
  const groups = new Map<T[K], T[]>();
  for (const row of rows) {
    const list = groups.get(row[key]) ?? [];
    list.push(row);
    groups.set(row[key], list);
  }
  return groups;
}

function toInput({ segments, exercises, sets }: Rows): SegmentInput[] {
  const exercisesBySegment = groupBy(exercises, "segment_id");
  const setsByExercise = groupBy(sets, "exercise_id");
  return segments.map((segment) => ({
    type: segment.type,
    label: segment.label,
    defaultRounds: segment.default_rounds,
    isScored: segment.is_scored,
    textContent: segment.text_content,
    scoreType: toScoreType(segment.score_type),
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
        intensityType: toIntensityType(set.intensity_type),
        intensityValue: set.intensity_value,
      })),
    })),
  }));
}

function toDrafts({ segments, exercises, sets }: Rows): SegmentDraft[] {
  const exercisesBySegment = groupBy(exercises, "segment_id");
  const setsByExercise = groupBy(sets, "exercise_id");
  return segments.map((segment) => ({
    key: segment.id,
    type: segment.type,
    label: segment.label ?? "",
    defaultRounds: segment.default_rounds,
    isScored: segment.is_scored,
    textContent: segment.text_content,
    scoreType: toScoreType(segment.score_type),
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

/** A workout in the shape the save actions take, to copy it somewhere else. */
export async function loadWorkout(
  supabase: ServerClient,
  owner: WorkoutOwner,
  id: string
): Promise<{ segments?: SegmentInput[]; error?: string }> {
  const rows = await fetchRows(supabase, owner, id);
  return "error" in rows ? { error: rows.error } : { segments: toInput(rows) };
}

/** A workout in the builder's editable shape (keys = row ids). Empty if it can't be read. */
export async function loadWorkoutDrafts(
  supabase: ServerClient,
  owner: WorkoutOwner,
  id: string
): Promise<SegmentDraft[]> {
  const rows = await fetchRows(supabase, owner, id);
  return "error" in rows ? [] : toDrafts(rows);
}

/**
 * Inserts a workout under a class or template. Callers clear the old one
 * first (deleting segments cascades to exercises and sets, 0015) — the
 * builder saves are full replaces, not diffs.
 */
export async function insertWorkout(
  supabase: ServerClient,
  owner: WorkoutOwner,
  id: string,
  segments: SegmentInput[]
): Promise<{ error?: string }> {
  for (const [i, segment] of segments.entries()) {
    const segmentRow = {
      type: segment.type,
      label: segment.label?.trim() || null,
      default_rounds: segment.defaultRounds,
      is_scored: segment.isScored,
      text_content: segment.textContent?.trim() || null,
      score_type: segment.scoreType,
      sort_order: i,
    };
    const { data: insertedSegment, error: segmentError } = await (owner === "session"
      ? supabase.from("session_segments").insert({ ...segmentRow, session_id: id })
      : supabase.from("template_segments").insert({ ...segmentRow, template_id: id })
    )
      .select("id")
      .single();

    if (segmentError || !insertedSegment) {
      return { error: userFacingError(segmentError, "Could not save segment.") };
    }

    for (const [j, exercise] of segment.exercises.entries()) {
      const { data: insertedExercise, error: exerciseError } = await supabase
        .from(owner === "session" ? "session_exercises" : "template_exercises")
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
        return { error: userFacingError(exerciseError, "Could not save exercise.") };
      }

      const { error: setsError } = await supabase
        .from(owner === "session" ? "session_exercise_sets" : "template_exercise_sets")
        .insert(
          exercise.sets.map((set, k) => ({
            exercise_id: insertedExercise.id,
            set_number: k + 1,
            target: set.target?.trim() || null,
            rest_seconds: set.restSeconds,
            ...intensityColumns(set),
            sort_order: k,
          }))
        );
      if (setsError) {
        return { error: userFacingError(setsError) };
      }
    }
  }

  return {};
}
