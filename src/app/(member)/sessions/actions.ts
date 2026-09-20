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

export async function joinWaitlist(
  sessionId: string,
  buddyEmail: string
): Promise<ActionResult> {
  const supabase = await createClient();
  let buddyMemberId: string | null = null;

  const trimmedEmail = buddyEmail.trim();
  if (trimmedEmail) {
    const { data, error } = await supabase.rpc("lookup_member_by_email", {
      p_email: trimmedEmail,
    });

    if (error) {
      return { error: error.message };
    }

    const buddy = data?.[0];
    if (!buddy) {
      return { error: "No member found with that email." };
    }

    buddyMemberId = buddy.id;
  }

  const { error } = await supabase.rpc("join_waitlist", {
    p_session_id: sessionId,
    p_buddy_member_id: buddyMemberId,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function leaveWaitlist(entryId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_waitlist", { p_entry_id: entryId });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function acceptWaitlistOffer(entryId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_waitlist_offer", { p_entry_id: entryId });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function inviteBuddy(sessionId: string, buddyEmail: string): Promise<ActionResult> {
  const supabase = await createClient();

  const trimmedEmail = buddyEmail.trim();
  if (!trimmedEmail) {
    return { error: "Enter your buddy's email." };
  }

  const { data, error: lookupError } = await supabase.rpc("lookup_member_by_email", {
    p_email: trimmedEmail,
  });

  if (lookupError) {
    return { error: lookupError.message };
  }

  const buddy = data?.[0];
  if (!buddy) {
    return { error: "No member found with that email." };
  }

  const { error } = await supabase.rpc("invite_buddy", {
    p_session_id: sessionId,
    p_buddy_member_id: buddy.id,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function acceptBookingInvite(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_booking_invite", { p_booking_id: bookingId });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function declineBookingInvite(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_booking_invite", { p_booking_id: bookingId });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function withdrawBookingInvite(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_booking_invite", { p_booking_id: bookingId });

  if (error) {
    return { error: error.message };
  }

  return {};
}
