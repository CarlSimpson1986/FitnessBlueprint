"use server";

import { requireCoachOrOwner } from "@/lib/auth";
import type { SegmentInput } from "@/lib/workout-content";
import { generateProgressionWeeks as generateWeeksFromAI } from "@/lib/progression-ai/gemini";
import { saveWorkoutTemplate, assignTemplateToSessionsInWeek } from "./actions";

export type GenerateResult = { weeks?: SegmentInput[][]; error?: string };

/**
 * Loads templateId's current content and asks Gemini to generate the
 * remaining weeks of the block. Nothing is written to the database here
 * — the result is shown to the coach for review/edit in the browser,
 * and only persisted (via approveGeneratedWeek) once they approve a
 * given week. That's deliberate: no new "draft" status or table needed,
 * since nothing exists until the existing, already-RLS-safe save path
 * is used.
 */
export async function generateProgressionWeeks(
  templateId: string,
  weekCount: number,
  instruction: string
): Promise<GenerateResult> {
  const { supabase } = await requireCoachOrOwner();

  if (!instruction.trim()) {
    return { error: "Describe how you want the block to progress." };
  }

  const { data: segments, error: segmentsError } = await supabase
    .from("template_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("template_id", templateId)
    .order("sort_order");

  if (segmentsError) {
    return { error: segmentsError.message };
  }

  const segmentRows = segments ?? [];
  if (segmentRows.length === 0) {
    return { error: "Save week 1's content before generating the rest of the block." };
  }

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

  const week1: SegmentInput[] = segmentRows.map((segment) => ({
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

  try {
    const weeks = await generateWeeksFromAI(week1, weekCount, instruction);
    return { weeks };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Autofinish failed — try again." };
  }
}

export type ApproveResult = { error?: string; assignedCount?: number };

/**
 * Persists one reviewed/edited generated week as a real workout
 * template (existing saveWorkoutTemplate, unchanged) and assigns it
 * onto that week's already-scheduled sessions of the given class type
 * (existing assignTemplateToSessionsInWeek, unchanged) — this action is
 * just wiring, both writes go through the same RLS-respecting paths
 * every other template save/assign already uses.
 */
export async function approveGeneratedWeek(
  name: string,
  segments: SegmentInput[],
  classTypeId: string,
  weekStartDate: string
): Promise<ApproveResult> {
  const saveResult = await saveWorkoutTemplate(name, segments);
  if (saveResult.error || !saveResult.templateId) {
    return { error: saveResult.error ?? "Could not save the generated week." };
  }

  const assignResult = await assignTemplateToSessionsInWeek(saveResult.templateId, classTypeId, weekStartDate);
  if (assignResult.error) {
    return { error: assignResult.error };
  }

  return { assignedCount: assignResult.assignedCount };
}
