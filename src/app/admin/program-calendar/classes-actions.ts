"use server";

import { requireOwner } from "@/lib/auth";

export type ActionResult = { error?: string };

export type ClassInput = {
  code: string;
  name: string;
  description: string | null;
  defaultDurationMinutes: number;
  defaultCapacity: number;
};

/**
 * RLS already permits this — "owner manages classes" (0024)
 * is `for all` on session_templates using is_coach_or_owner(), so this
 * needed no new policy, only this action + UI.
 */
export async function createClass(input: ClassInput): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  if (!input.code.trim() || !input.name.trim()) {
    return { error: "Code and name are required." };
  }

  const { error } = await supabase.from("session_templates").insert({
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    default_duration_minutes: input.defaultDurationMinutes,
    default_capacity: input.defaultCapacity,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function updateClass(classId: string, input: ClassInput): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  if (!input.code.trim() || !input.name.trim()) {
    return { error: "Code and name are required." };
  }

  const { error } = await supabase
    .from("session_templates")
    .update({
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      default_duration_minutes: input.defaultDurationMinutes,
      default_capacity: input.defaultCapacity,
    })
    .eq("id", classId);

  if (error) {
    return { error: error.message };
  }

  return {};
}

/**
 * Soft-delete only — sessions already reference this class type
 * (template_id is not-null on sessions), so a real delete would need a
 * cascade decision this action deliberately doesn't make. Deactivating
 * just removes it from the "session type" picker everywhere that already
 * filters on is_active (e.g. schedule-actions.ts, program-calendar).
 */
export async function setClassActive(classId: string, isActive: boolean): Promise<ActionResult> {
  const { supabase } = await requireOwner();

  const { error } = await supabase.from("session_templates").update({ is_active: isActive }).eq("id", classId);

  if (error) {
    return { error: error.message };
  }

  return {};
}
