"use server";

import { requireOwner } from "@/lib/auth";
import type { SegmentInput } from "@/lib/workout-content";

export type ActionResult = { error?: string; templateId?: string };

/**
 * Create-or-replace, same full-replace reasoning as saveSessionWorkout
 * (src/app/admin/program-calendar/sessions/[sessionId]/workout/actions.ts) —
 * a template is
 * small, hand-built content, not worth diffing. Pass templateId to replace
 * an existing template's content in place (keeps its id, so any session
 * that already copied from it is unaffected — copies are independent rows).
 */
export async function saveWorkoutTemplate(
  name: string,
  segments: SegmentInput[],
  templateId?: string
): Promise<ActionResult> {
  const { supabase, user } = await requireOwner();

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Name this template." };
  }
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

  let id = templateId;

  if (id) {
    const { error: updateError } = await supabase
      .from("workout_templates")
      .update({ name: trimmedName })
      .eq("id", id);

    if (updateError) {
      return { error: updateError.message };
    }

    const { error: deleteError } = await supabase.from("template_segments").delete().eq("template_id", id);
    if (deleteError) {
      return { error: deleteError.message };
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("workout_templates")
      .insert({ name: trimmedName, created_by: user.id })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { error: insertError?.message ?? "Could not create template." };
    }
    id = inserted.id;
  }

  for (const [i, segment] of segments.entries()) {
    const { data: insertedSegment, error: segmentError } = await supabase
      .from("template_segments")
      .insert({
        template_id: id,
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
        .from("template_exercises")
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

      const { error: setsError } = await supabase.from("template_exercise_sets").insert(setRows);
      if (setsError) {
        return { error: setsError.message };
      }
    }
  }

  return { templateId: id };
}

/**
 * Finds already-scheduled sessions of a given class type
 * (session_templates — FNL/KIDS/GC, NOT workout_templates) whose date
 * falls in the Mon-Sun week starting weekStartDate, and assigns the
 * given workout template onto each — a small loop over the existing
 * assignTemplateToSession, not a new bulk-assign primitive. Used by
 * "Autofinish with AI" once a generated week is approved.
 */
export async function assignTemplateToSessionsInWeek(
  workoutTemplateId: string,
  classTypeId: string,
  weekStartDate: string
): Promise<ActionResult & { assignedCount?: number }> {
  const { supabase } = await requireOwner();

  const weekStart = new Date(`${weekStartDate}T00:00:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("template_id", classTypeId)
    .eq("status", "scheduled")
    .gte("session_date", weekStart.toISOString().slice(0, 10))
    .lte("session_date", weekEnd.toISOString().slice(0, 10));

  if (error) {
    return { error: error.message };
  }

  if (!sessions || sessions.length === 0) {
    return { error: "No scheduled sessions of that class in that week — nothing to assign." };
  }

  for (const session of sessions) {
    const result = await assignTemplateToSession(workoutTemplateId, session.id);
    if (result.error) {
      return { error: result.error };
    }
  }

  return { assignedCount: sessions.length };
}

export async function deleteWorkoutTemplate(templateId: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("workout_templates").delete().eq("id", templateId);
  if (error) {
    return { error: error.message };
  }
  return {};
}

/**
 * Copies a template's current content into a session's own
 * session_segments/session_exercises/session_exercise_sets (0015, 0020) —
 * a point-in-time copy, not a live reference, so editing the template later
 * never changes a session it was already assigned to. Used by the program
 * calendar (src/app/admin/program-calendar).
 */
export async function assignTemplateToSession(templateId: string, sessionId: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  const { data: segments, error: segmentsError } = await supabase
    .from("template_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("template_id", templateId)
    .order("sort_order");

  if (segmentsError) {
    return { error: segmentsError.message };
  }

  const segmentRows = segments ?? [];
  const { data: exercises, error: exercisesError } = await supabase
    .from("template_exercises")
    .select("id, segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order")
    .in("segment_id", segmentRows.map((s) => s.id))
    .order("sort_order");

  if (exercisesError) {
    return { error: exercisesError.message };
  }

  const exerciseRows = exercises ?? [];
  const { data: sets, error: setsError } = await supabase
    .from("template_exercise_sets")
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

  const input: SegmentInput[] = segmentRows.map((segment) => ({
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

  if (input.length === 0) {
    return { error: "That template has no content yet." };
  }

  const { error: deleteError } = await supabase.from("session_segments").delete().eq("session_id", sessionId);
  if (deleteError) {
    return { error: deleteError.message };
  }

  for (const [i, segment] of input.entries()) {
    const { data: insertedSegment, error: segmentError } = await supabase
      .from("session_segments")
      .insert({
        session_id: sessionId,
        type: segment.type,
        label: segment.label,
        default_rounds: segment.defaultRounds,
        sort_order: i,
      })
      .select("id")
      .single();

    if (segmentError || !insertedSegment) {
      return { error: segmentError?.message ?? "Could not assign segment." };
    }

    for (const [j, exercise] of segment.exercises.entries()) {
      const { data: insertedExercise, error: exerciseError } = await supabase
        .from("session_exercises")
        .insert({
          segment_id: insertedSegment.id,
          name: exercise.name,
          metric_type: exercise.metricType,
          each_side: exercise.eachSide,
          tempo: exercise.tempo,
          note: exercise.note,
          video_url: exercise.videoUrl,
          sort_order: j,
        })
        .select("id")
        .single();

      if (exerciseError || !insertedExercise) {
        return { error: exerciseError?.message ?? "Could not assign exercise." };
      }

      const setRows = exercise.sets.map((set, k) => ({
        exercise_id: insertedExercise.id,
        set_number: k + 1,
        target: set.target,
        rest_seconds: set.restSeconds,
        sort_order: k,
      }));

      const { error: insertSetsError } = await supabase.from("session_exercise_sets").insert(setRows);
      if (insertSetsError) {
        return { error: insertSetsError.message };
      }
    }
  }

  return {};
}
