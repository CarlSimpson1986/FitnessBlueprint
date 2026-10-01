"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { FOLLOW_UP_STATUSES, type FollowUpStatus } from "@/lib/conversions";

export type ActionResult = { error?: string };

/**
 * Owner records the "what next?" chat for one programme membership.
 * `status: null` clears it back to "not spoken yet". RLS (0037) is the
 * guard — programme_followups only has owner policies, so this runs on
 * the owner's own client, no admin client.
 */
export async function saveFollowUp(input: {
  membershipId: string;
  memberId: string;
  status: FollowUpStatus | null;
  followUpOn: string | null;
  note: string;
}): Promise<ActionResult> {
  const { supabase, user } = await requireOwner();

  if (input.status === null) {
    const { error } = await supabase.from("programme_followups").delete().eq("membership_id", input.membershipId);
    if (error) return { error: error.message };
    revalidatePath("/owner/conversions");
    return {};
  }

  if (!FOLLOW_UP_STATUSES.includes(input.status)) {
    return { error: "Unknown follow-up status." };
  }
  if (input.status === "follow_up" && !/^\d{4}-\d{2}-\d{2}$/.test(input.followUpOn ?? "")) {
    return { error: "Pick a date to follow up on." };
  }

  const { error } = await supabase.from("programme_followups").upsert(
    {
      membership_id: input.membershipId,
      member_id: input.memberId,
      status: input.status,
      follow_up_on: input.status === "follow_up" ? input.followUpOn : null,
      note: input.note.trim() || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "membership_id" }
  );
  if (error) return { error: error.message };

  revalidatePath("/owner/conversions");
  return {};
}
