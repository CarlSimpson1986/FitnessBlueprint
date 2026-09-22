"use server";

import { requireCoachOrOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toLocalDateKey } from "@/lib/format";

export type ActionResult = { error?: string };

// Deliberately no revalidatePath() here — called directly from a client
// startTransition, not a <form action>. router.refresh() is called
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
      // toLocalDateKey, not toISOString().slice(0, 10) — the latter converts
      // to UTC, which rolls the date back a day whenever the server runs in
      // a positive UTC-offset zone (e.g. BST) since local midnight is the
      // previous day in UTC. See src/lib/format.ts's toLocalDateKey comment
      // for the same footgun on the client side.
      session_date: toLocalDateKey(date),
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
