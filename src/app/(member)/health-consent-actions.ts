"use server";

import { requireProfile } from "@/lib/auth";

export type ActionResult = { error?: string };

/**
 * Saves the member's health-info answer (0043). Goes through the
 * set_health_choices() RPC, which only ever updates the caller's own row —
 * an RPC because coaches and the owner answer too, and the profiles
 * self-update policy only covers role = 'member'. A "no" always clears
 * body-metric tracking with it.
 */
export async function saveHealthChoices(consent: boolean, trackBodyMetrics: boolean): Promise<ActionResult> {
  const { supabase } = await requireProfile();

  const { error } = await supabase.rpc("set_health_choices", {
    p_consent: consent,
    p_track_body_metrics: consent && trackBodyMetrics,
  });

  if (error) {
    return { error: error.message };
  }
  return {};
}
