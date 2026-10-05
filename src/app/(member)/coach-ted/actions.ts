"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Member's thumbs up/down on one of their Coach Ted answers (null undoes
 * it). rate_ted_answer() (0053) only touches the caller's own answers.
 */
export async function rateTedAnswer(conversationId: string, rating: "up" | "down" | null): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rate_ted_answer", { p_conversation_id: conversationId, p_rating: rating });
  if (error) {
    console.error("rateTedAnswer failed:", error);
    return { error: "Couldn't save that — try again." };
  }
  return {};
}
