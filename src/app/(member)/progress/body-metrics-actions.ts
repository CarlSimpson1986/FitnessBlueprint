"use server";

import { requireProfile } from "@/lib/auth";

export type LogBodyMetricsResult = { error?: string };

export async function logBodyMetrics(input: {
  weightKg: number | null;
  waistCm: number | null;
  bodyFatPct: number | null;
}): Promise<LogBodyMetricsResult> {
  const { supabase, user } = await requireProfile();

  if (input.weightKg === null && input.waistCm === null && input.bodyFatPct === null) {
    return { error: "Log at least one measurement." };
  }
  if (input.weightKg !== null && (input.weightKg <= 0 || input.weightKg > 500)) {
    return { error: "Enter a valid weight in kg." };
  }
  if (input.waistCm !== null && (input.waistCm <= 0 || input.waistCm > 300)) {
    return { error: "Enter a valid waist measurement in cm." };
  }
  if (input.bodyFatPct !== null && (input.bodyFatPct <= 0 || input.bodyFatPct > 100)) {
    return { error: "Enter a valid body fat percentage." };
  }

  const { error } = await supabase.from("body_metrics").insert({
    member_id: user.id,
    weight_kg: input.weightKg,
    waist_cm: input.waistCm,
    body_fat_pct: input.bodyFatPct,
  });

  if (error) {
    return { error: error.message };
  }
  return {};
}
