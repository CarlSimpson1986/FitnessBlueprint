"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

export async function joinChallenge(challengeId: string): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  const { error } = await supabase
    .from("challenge_participants")
    .insert({ challenge_id: challengeId, member_id: user.id });

  if (error) {
    if (error.code === "23505") {
      return {};
    }
    return { error: error.message };
  }

  return {};
}
