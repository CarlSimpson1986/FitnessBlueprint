"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";

/**
 * Guy ticks an answer off his "needs a look" list. Owner's RLS client —
 * "coach_ted_conversations: change" (0053) is owner-only.
 */
export async function markTedAnswerReviewed(conversationId: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("coach_ted_conversations")
    .update({ owner_reviewed_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) console.error("markTedAnswerReviewed failed:", error);
  revalidatePath("/owner/ted-conversations");
}
