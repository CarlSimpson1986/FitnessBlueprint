"use server";

import { requireOwner } from "@/lib/auth";

export type ActionResult = { error?: string };

// Both writes go through the owner's RLS-respecting client — the
// "owner manages coach time off" policy (0032) is what allows them.

export async function addTimeOff(input: { coachId: string; startsOn: string; endsOn: string; note: string }): Promise<ActionResult> {
  const { supabase, user } = await requireOwner();
  if (!input.coachId || !input.startsOn || !input.endsOn) return { error: "Pick a coach and both dates." };
  if (input.endsOn < input.startsOn) return { error: "The end date is before the start date." };

  const { error } = await supabase.from("coach_time_off").insert({
    coach_id: input.coachId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    note: input.note.trim() || null,
    created_by: user.id,
  });
  return error ? { error: error.message } : {};
}

export async function deleteTimeOff(id: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("coach_time_off").delete().eq("id", id);
  return error ? { error: error.message } : {};
}

/**
 * Hands a session to a covering coach by making them its coach — the
 * session then drops off the "needs cover" list. RLS: "owner manages
 * sessions" (0024).
 */
export async function assignCover(sessionId: string, coachId: string): Promise<ActionResult> {
  const { supabase } = await requireOwner();
  if (!coachId) return { error: "Pick a coach." };
  const { error } = await supabase.from("sessions").update({ coach_id: coachId }).eq("id", sessionId);
  return error ? { error: error.message } : {};
}
