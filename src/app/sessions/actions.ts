"use server";

import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string };

/**
 * Deliberately no revalidatePath() here — these are called directly from
 * a client startTransition (not a <form action>), and pairing that with
 * revalidatePath caused the transition's pending state to hang client-side
 * indefinitely on success. The client calls router.refresh() itself after
 * a successful result instead, which isn't coupled to this promise.
 */
export async function bookSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_session", { p_session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });

  if (error) {
    return { error: error.message };
  }

  return {};
}
