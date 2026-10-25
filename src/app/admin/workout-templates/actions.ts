"use server";

import { requireOwner } from "@/lib/auth";
import { refuseIfLogged } from "@/lib/session-workout";
import { type SegmentInput } from "@/lib/workout-content";
import { userFacingError } from "@/lib/user-facing-error";
import { insertWorkout, loadWorkout, workoutProblem } from "@/lib/workout-store";

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
  const problem = workoutProblem(segments);
  if (problem) return { error: problem };

  let id = templateId;

  if (id) {
    const { error: updateError } = await supabase
      .from("workout_templates")
      .update({ name: trimmedName })
      .eq("id", id);

    if (updateError) {
      return { error: userFacingError(updateError) };
    }

    const { error: deleteError } = await supabase.from("template_segments").delete().eq("template_id", id);
    if (deleteError) {
      return { error: userFacingError(deleteError) };
    }
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("workout_templates")
      .insert({ name: trimmedName, created_by: user.id })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return { error: userFacingError(insertError, "Could not create template.") };
    }
    id = inserted.id;
  }

  const inserted = await insertWorkout(supabase, "template", id, segments);
  if (inserted.error) return { error: inserted.error };

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
    return { error: userFacingError(error) };
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
    return { error: userFacingError(error) };
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

  const template = await loadWorkout(supabase, "template", templateId);
  if (template.error || !template.segments) {
    return { error: template.error ?? "Could not read that template." };
  }
  if (template.segments.length === 0) {
    return { error: "That template has no content yet." };
  }

  // Same guard as saveSessionWorkout: never replace a logged class's workout.
  const blocked = await refuseIfLogged(supabase, sessionId);
  if (blocked) return blocked;

  const { error: deleteError } = await supabase.from("session_segments").delete().eq("session_id", sessionId);
  if (deleteError) {
    return { error: userFacingError(deleteError) };
  }

  return insertWorkout(supabase, "session", sessionId, template.segments);
}

