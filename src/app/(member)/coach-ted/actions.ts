"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Member's thumbs up/down on one of their Coach Ted answers (null undoes
 * it), with an optional "what was wrong?" for a Not helpful (0058).
 * rate_ted_answer() only touches the caller's own answers.
 */
export async function rateTedAnswer(
  conversationId: string,
  rating: "up" | "down" | null,
  reason?: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_ted_answer", {
    p_conversation_id: conversationId,
    p_rating: rating,
    p_reason: reason?.trim().slice(0, 300) || null,
  });
  if (error) {
    console.error("rateTedAnswer failed:", error);
    return { error: "Couldn't save that — try again." };
  }
  return {};
}
