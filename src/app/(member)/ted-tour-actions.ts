"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

/**
 * Members update their own profiles.has_seen_ted_tour under "profiles:
 * change" (0046 — own row, role stays 'member'); no new RLS needed since
 * this column isn't role.
 */
export async function markTedTourSeen(): Promise<ActionResult> {
  const { supabase, user } = await requireProfile();

  const { error } = await supabase
    .from("profiles")
    .update({ has_seen_ted_tour: true })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  return {};
}

/**
 * "Show me round again" on Profile (Carl, 2026-10-05): clears the flag
 * and goes home, where the tour opens.
 */
export async function replayTedTour() {
  const { supabase, user } = await requireProfile();
  await supabase.from("profiles").update({ has_seen_ted_tour: false }).eq("id", user.id);
  redirect("/");
}
