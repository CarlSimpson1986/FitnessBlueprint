"use server";

import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { guestInviteEmailHtml } from "@/lib/guest-invites";
import { sendBookingConfirmation } from "@/lib/session-emails";

export type ActionResult = { error?: string };
export type BookResult = ActionResult & { needsHealthAnswer?: boolean };

/**
 * Deliberately no revalidatePath() here — these are called directly from
 * a client startTransition (not a <form action>), and pairing that with
 * revalidatePath caused the transition's pending state to hang client-side
 * indefinitely on success. The client calls router.refresh() itself after
 * a successful result instead, which isn't coupled to this promise.
 */
export async function bookSession(sessionId: string): Promise<BookResult> {
  const supabase = await createClient();

  // They must answer the health-info question before booking (0043). Either
  // answer books — consent can't be a condition of membership.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("health_consent").eq("id", user.id).maybeSingle();
    if (profile && profile.health_consent === null) {
      return { needsHealthAnswer: true };
    }
  }

  const { error } = await supabase.rpc("book_session", { p_session_id: sessionId });

  if (error) {
    return { error: error.message };
  }

  await sendBookingConfirmation(supabase, sessionId);
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
  const { data: booking, error } = await supabase.rpc("accept_waitlist_offer", { p_entry_id: entryId });

  if (error) {
    return { error: error.message };
  }

  if (booking?.session_id) await sendBookingConfirmation(supabase, booking.session_id);
  return {};
}

export type GuestInviteResult = ActionResult & {
  /** The class is full: the member is pointed at messaging the gym instead. */
  full?: boolean;
  /** Set when the email didn't go, so the member can send the link themselves. */
  shareUrl?: string;
};

/**
 * Refer a friend (0050). invite_guest checks the member is booked in, has a
 * guest pass left this month, the friend isn't already a member and the
 * class has room — all in the database, under the member's own session.
 * Then the friend is emailed their confirm link.
 */
export async function inviteGuest(sessionId: string, guestName: string, guestEmail: string): Promise<GuestInviteResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("invite_guest", {
    p_session_id: sessionId,
    p_name: guestName,
    p_email: guestEmail,
  });
  if (error) {
    return { error: error.message, full: error.message.startsWith("This class is full") };
  }
  const token = data?.[0]?.token;
  if (!token) return { error: "Couldn't create the invite — try again." };

  const url = `${publicEnv.NEXT_PUBLIC_SITE_URL}/guest/${token}`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: inviter }, { data: session }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle(),
    supabase.from("sessions").select("session_date, start_time, template_id").eq("id", sessionId).maybeSingle(),
  ]);
  const { data: template } = session
    ? await supabase.from("session_templates").select("name").eq("id", session.template_id).maybeSingle()
    : { data: null };

  const { error: emailError } = await sendEmail({
    to: guestEmail.trim().toLowerCase(),
    subject: `${inviter?.full_name?.split(" ")[0] ?? "A friend"} has invited you to train at Fitness Blueprint`,
    html: guestInviteEmailHtml({
      guestName: guestName.trim(),
      inviterName: inviter?.full_name ?? "A friend",
      className: template?.name ?? "a class",
      sessionDate: session?.session_date ?? "",
      startTime: session?.start_time ?? "",
      url,
    }),
  });
  if (emailError) {
    console.error("inviteGuest: email failed —", emailError);
    return { shareUrl: url };
  }

  return {};
}

export async function cancelGuestInvite(inviteId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_guest_invite", { p_invite_id: inviteId });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function acceptBookingInvite(bookingId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: booking, error } = await supabase.rpc("accept_booking_invite", { p_booking_id: bookingId });

  if (error) {
    return { error: error.message };
  }

  if (booking?.session_id) await sendBookingConfirmation(supabase, booking.session_id);
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

