"use server";

import { requireCoachOrOwner } from "@/lib/auth";
import type { SegmentInput } from "@/lib/workout-content";
import { saveWorkoutTemplate } from "@/app/admin/workout-templates/actions";

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

type Supabase = Awaited<ReturnType<typeof requireCoachOrOwner>>["supabase"];

/**
 * Reads a session's current workout back into the same SegmentInput shape
 * the builder saves, so it can be re-saved elsewhere (another session, or
 * the template library) as a real, independent copy.
 */
async function loadSessionWorkout(
  supabase: Supabase,
  sessionId: string
): Promise<{ segments?: SegmentInput[]; error?: string }> {
  const { data: segments, error: segmentsError } = await supabase
    .from("session_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order");

  if (segmentsError) {
    return { error: segmentsError.message };
  }

  const segmentRows = segments ?? [];
  if (segmentRows.length === 0) {
    return { segments: [] };
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

  return {
    segments: segmentRows.map((segment) => ({
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
    })),
  };
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
 * RLS: "coaches and owner manage sessions" (0002) authorizes the insert,
 * and the session_segments/exercises/sets "coaches and owner manage"
 * policies (0015, 0020) authorize the workout write — no admin client.
 */
export async function pasteSessionToDate(sourceSessionId: string, dateKey: string): Promise<ActionResult> {
  const { supabase } = await requireCoachOrOwner();

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

  const workout = await loadSessionWorkout(supabase, sourceSessionId);
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
    return { error: existingError.message };
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
    return { error: insertError?.message ?? "Could not schedule the session." };
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
  const { supabase } = await requireCoachOrOwner();

  const workout = await loadSessionWorkout(supabase, sessionId);
  if (workout.error || !workout.segments) {
    return { error: workout.error ?? "Could not read that workout." };
  }
  if (workout.segments.length === 0) {
    return { error: "That session has no workout yet." };
  }

  const result = await saveWorkoutTemplate(name, workout.segments);
  return result.error ? { error: result.error } : {};
}
