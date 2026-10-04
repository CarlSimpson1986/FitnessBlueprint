"use server";

import { createClient } from "@/lib/supabase/server";

export type GuestResponse = {
  accept: boolean;
  phone?: string;
  healthAnyYes?: boolean;
  healthNotes?: string;
  consent?: boolean;
};

/**
 * The guest's answer from their emailed link (no account). All checks —
 * live invite, before the cut-off, phone, health answers, consent — are in
 * respond_guest_invite (0050), which is the only way to write a guest's
 * details; guest_details has no insert policy.
 */
export async function respondToGuestInvite(token: string, input: GuestResponse): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_guest_invite", {
    p_token: token,
    p_accept: input.accept,
    p_phone: input.phone,
    p_health_any_yes: input.healthAnyYes,
    p_health_notes: input.healthNotes,
    p_consent: input.consent,
  });
  return error ? { error: error.message } : {};
}
