"use server";

import { requireProfile } from "@/lib/auth";
import { BODY_GOAL_METRICS, isBodyGoalMetric } from "@/lib/goal-tracking";

export type ActionResult = { error?: string };

export type GoalType = "lose_weight" | "build_muscle" | "build_strength" | "general_fitness" | "event_prep";

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
  /** Where they were when they set it — the Goals card's "Start". */
  startValue: number | null;
  /** A body measurement typed into the wizard because we had none on record. */
  bodyBaseline: { metric: string; value: number } | null;
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
  if (input.startValue !== null && !Number.isFinite(input.startValue)) {
    return { error: "That starting number doesn't look right." };
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
    start_value: input.startValue,
    status: "active",
  });

  if (error) {
    return { error: error.message };
  }

  // Log it as a body metric so Progress has a starting point. RLS
  // ("body_metrics: create", 0046) scopes this to the member and refuses it
  // if they've opted out of body measurements (0043).
  const body = input.bodyBaseline;
  if (body && isBodyGoalMetric(body.metric) && Number.isFinite(body.value) && body.value > 0) {
    const column = BODY_GOAL_METRICS[body.metric];
    await supabase.from("body_metrics").insert({
      member_id: user.id,
      weight_kg: column === "weight_kg" ? body.value : null,
      waist_cm: column === "waist_cm" ? body.value : null,
      hip_cm: column === "hip_cm" ? body.value : null,
      body_fat_pct: column === "body_fat_pct" ? body.value : null,
    });
  }

  return {};
}
