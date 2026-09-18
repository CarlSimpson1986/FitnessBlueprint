"use server";

import { requireProfile } from "@/lib/auth";

export type LogWeighInResult = { error?: string };

export async function logWeighIn(weightKg: number): Promise<LogWeighInResult> {
  const { supabase, user } = await requireProfile();

  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 500) {
    return { error: "Enter a valid weight in kg." };
  }

  const { error } = await supabase.from("weigh_ins").insert({
    member_id: user.id,
    weight_kg: weightKg,
  });

  if (error) {
    return { error: error.message };
  }
  return {};
}
