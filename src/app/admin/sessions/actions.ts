"use server";

import { requireCoachOrOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { error?: string };

// Deliberately no revalidatePath() here — called directly from a client
// startTransition, not a <form action>. See sessions/actions.ts for why
// that combination hangs the pending state; router.refresh() is called
// client-side instead.

export async function createSessions(input: {
  templateId: string;
  coachId: string;
  startDate: string;
  startTime: string;
  weeksToRepeat: number;
  capacity: number | null;
}): Promise<ActionResult> {
  const { supabase } = await requireCoachOrOwner();

  const { data: template, error: templateError } = await supabase
    .from("session_templates")
    .select("default_duration_minutes, default_capacity")
    .eq("id", input.templateId)
    .maybeSingle();

  if (templateError || !template) {
    return { error: "Session type not found." };
  }

  const weeks = Math.min(Math.max(Math.trunc(input.weeksToRepeat), 1), 26);
  const capacity = input.capacity ?? template.default_capacity;

  const rows = Array.from({ length: weeks }, (_, i) => {
    const date = new Date(`${input.startDate}T00:00:00`);
    date.setDate(date.getDate() + i * 7);

    return {
      template_id: input.templateId,
      coach_id: input.coachId,
      session_date: date.toISOString().slice(0, 10),
      start_time: input.startTime,
      duration_minutes: template.default_duration_minutes,
      capacity,
      status: "scheduled" as const,
    };
  });

  // Relies on RLS ("coaches and owner manage sessions") to actually
  // enforce who can write here — this is the RLS-respecting client,
  // not the admin client, since there's nothing to bypass.
  const { error } = await supabase.from("sessions").insert(rows);

  if (error) {
    return { error: error.message };
  }

  return {};
}

export type RosterEntry = {
  bookingId: string;
  memberName: string;
  status: "booked" | "cancelled" | "attended" | "no_show" | "excused";
};

/**
 * Roster is read via the RLS-respecting client — "coaches and owner read
 * all bookings" and "coaches and owner read all profiles" (0002) already
 * cover this, so there's nothing to bypass here.
 */
export async function getSessionRoster(sessionId: string): Promise<{ roster?: RosterEntry[]; error?: string }> {
  const { supabase } = await requireCoachOrOwner();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, member_id, status")
    .eq("session_id", sessionId)
    .order("booked_at");

  if (error) {
    return { error: error.message };
  }

  const memberIds = (bookings ?? []).map((b) => b.member_id);
  const { data: members, error: membersError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", memberIds.length > 0 ? memberIds : [""]);

  if (membersError) {
    return { error: membersError.message };
  }

  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  const roster = (bookings ?? []).map((booking) => ({
    bookingId: booking.id,
    memberName: nameById.get(booking.member_id) ?? "Unknown member",
    status: booking.status,
  }));

  return { roster };
}

const MARKABLE_STATUSES = ["attended", "no_show", "excused"] as const;
type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

/**
 * Marking attendance updates a single booking — "coaches and owner
 * update any booking" (0002) covers this, so again no admin client.
 */
export async function markAttendance(bookingId: string, status: MarkableStatus): Promise<ActionResult> {
  const { supabase } = await requireCoachOrOwner();

  if (!MARKABLE_STATUSES.includes(status)) {
    return { error: "Invalid attendance status." };
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("status", "booked")
    .select("id");

  if (error) {
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    return { error: "This booking is no longer marked as booked — refresh and try again." };
  }

  return {};
}

/**
 * Cancelling a session isn't just an update to the sessions row — any
 * member who'd booked (and paid a credit for) it needs that credit back,
 * same as if they'd cancelled it themselves. That refund path touches
 * credit_ledger, which has no policy for anyone but the service role
 * (see 0001), so this needs the admin client even though the sessions
 * update alone wouldn't.
 */
export async function cancelSession(sessionId: string): Promise<ActionResult> {
  const { user: staff } = await requireCoachOrOwner();

  const admin = createAdminClient();

  const { error: sessionError } = await admin
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);

  if (sessionError) {
    return { error: sessionError.message };
  }

  const { data: activeBookings, error: bookingsError } = await admin
    .from("bookings")
    .select("id, member_id, credit_ledger_id")
    .eq("session_id", sessionId)
    .eq("status", "booked");

  if (bookingsError) {
    return { error: bookingsError.message };
  }

  for (const booking of activeBookings ?? []) {
    const { error: cancelError } = await admin
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", booking.id);

    if (cancelError) {
      return { error: cancelError.message };
    }

    if (booking.credit_ledger_id) {
      const { error: refundError } = await admin.from("credit_ledger").insert({
        member_id: booking.member_id,
        delta: 1,
        reason: "cancellation_refund",
        related_booking_id: booking.id,
        created_by: staff.id,
      });

      if (refundError) {
        return { error: refundError.message };
      }
    }
  }

  return {};
}
