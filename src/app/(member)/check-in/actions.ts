"use server";

import { requireProfile } from "@/lib/auth";
import { openCheckinWeek } from "@/lib/weekly-checkin";

export type ActionResult = { error?: string };

export type WeeklyCheckinInput = {
  weightKg: number | null;
  energy: number;
  sleep: number;
  nutrition: number;
  win: string;
  struggle: string;
  noteForCoach: string;
};

const isRating = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

/**
 * Saves this week's check-in for the signed-in member. RLS ("members submit
 * own weekly checkins", 0028) scopes the write to their own row; a weight,
 * if given, also goes into body_metrics ("members log own body metrics",
 * 0017) so Progress charts pick it up.
 */
export async function submitWeeklyCheckin(input: WeeklyCheckinInput): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  const weekOf = openCheckinWeek();
  if (!weekOf) {
    return { error: "Check-ins open on Sunday — come back then." };
  }
  if (!isRating(input.energy) || !isRating(input.sleep) || !isRating(input.nutrition)) {
    return { error: "Rate energy, sleep and nutrition from 1 to 5." };
  }
  if (input.weightKg !== null && (!Number.isFinite(input.weightKg) || input.weightKg <= 20 || input.weightKg > 350)) {
    return { error: "That weight doesn't look right — check the number (in kg)." };
  }

  const { error } = await supabase.from("weekly_checkins").insert({
    member_id: user.id,
    week_of: weekOf,
    weight_kg: input.weightKg,
    energy: input.energy,
    sleep: input.sleep,
    nutrition: input.nutrition,
    win: input.win.trim() || null,
    struggle: input.struggle.trim() || null,
    note_for_coach: input.noteForCoach.trim() || null,
  });

  if (error) {
    return {
      error: error.code === "23505" ? "You've already checked in this week — nice." : error.message,
    };
  }

  if (input.weightKg !== null) {
    await supabase.from("body_metrics").insert({ member_id: user.id, weight_kg: input.weightKg });
  }

  return {};
}
