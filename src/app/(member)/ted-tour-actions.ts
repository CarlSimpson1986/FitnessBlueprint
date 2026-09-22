"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

/**
 * One-way — there's no "reset the tour" path anywhere in the app, on
 * purpose. Members update their own profiles.has_seen_ted_tour under
 * the existing "members update own profile" policy (0002); no new RLS
 * needed since this column isn't role.
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
