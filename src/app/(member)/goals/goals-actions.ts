"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

export type GoalType = "lose_weight" | "build_strength" | "general_fitness" | "event_prep";

export type SaveGoalInput = {
  type: GoalType;
  metric: string;
  longTarget: string;
  longDate: string | null;
  microTarget: string;
  checkinDate: string;
  barriers: string | null;
  habits: string[];
  why: string | null;
};

/**
 * The goal-setting wizard (GoalWizard.tsx) is a scripted client-side flow,
 * NOT the Coach Ted/Gemini chat pipeline — that pipeline is single-turn and
 * cache-first, actively wrong for collecting structured data. This action
 * is its only write path. A fresh goal-setting pass always inserts a new
 * row (status 'active'); any previous active goal for this member is
 * marked 'abandoned' first, so there's only ever one active goal at a time
 * (the app only ever queries the latest active row).
 */
export async function saveGoal(input: SaveGoalInput): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  if (!input.metric.trim() || !input.longTarget.trim() || !input.microTarget.trim()) {
    return { error: "Missing required fields." };
  }

  const { error: abandonError } = await supabase
    .from("goals")
    .update({ status: "abandoned" })
    .eq("member_id", user.id)
    .eq("status", "active");

  if (abandonError) {
    return { error: abandonError.message };
  }

  const { error } = await supabase.from("goals").insert({
    member_id: user.id,
    type: input.type,
    metric: input.metric,
    long_target: input.longTarget,
    long_date: input.longDate,
    micro_target: input.microTarget,
    checkin_date: input.checkinDate,
    barriers: input.barriers,
    habits: input.habits,
    why: input.why,
    status: "active",
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
