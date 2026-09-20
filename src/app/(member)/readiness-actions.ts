"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

const FEELINGS = ["great", "okay", "rough"] as const;
const SLEEP_QUALITIES = ["good", "average", "poor"] as const;

export async function submitReadinessCheckin(input: {
  sessionId: string;
  feeling: (typeof FEELINGS)[number];
  sleepQuality: (typeof SLEEP_QUALITIES)[number] | null;
  painArea: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  if (!FEELINGS.includes(input.feeling)) {
    return { error: "Invalid feeling." };
  }
  if (input.sleepQuality !== null && !SLEEP_QUALITIES.includes(input.sleepQuality)) {
    return { error: "Invalid sleep quality." };
  }

  const { error } = await supabase.from("readiness_checkins").insert({
    member_id: user.id,
    session_id: input.sessionId,
    feeling: input.feeling,
    sleep_quality: input.sleepQuality,
    pain_area: input.painArea.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return {};
    }
    return { error: error.message };
  }

  return {};
}
