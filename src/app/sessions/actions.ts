"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { error?: string };

export async function bookSession(sessionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("book_session", { p_session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/sessions");
  return {};
}

export async function cancelBooking(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/sessions");
  return {};
}
