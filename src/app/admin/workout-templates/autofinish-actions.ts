"use server";

import { requireOwner } from "@/lib/auth";
import { type SegmentInput } from "@/lib/workout-content";
import { generateProgressionWeeks as generateWeeksFromAI } from "@/lib/progression-ai/gemini";
import { loadWorkout } from "@/lib/workout-store";
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
  const { supabase } = await requireOwner();

  if (!instruction.trim()) {
    return { error: "Describe how you want the block to progress." };
  }

  const template = await loadWorkout(supabase, "template", templateId);
  if (template.error || !template.segments) {
    return { error: template.error ?? "Could not read that template." };
  }
  const week1 = template.segments;
  if (week1.length === 0) {
    return { error: "Save week 1's content before generating the rest of the block." };
  }

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
