"use server";

import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { toLocalDateKey } from "@/lib/format";
import { userFacingError } from "@/lib/user-facing-error";

export type ActionResult = { error?: string };
export type ScheduleResult = ActionResult & { created?: number; skipped?: number };

// Deliberately no revalidatePath() here — called directly from a client
// startTransition, not a <form action>. router.refresh() is called
// client-side instead.

/**
 * Adds a class on one day, or a recurring one: every ticked weekday
 * (0 = Mon … 6 = Sun) for N weeks from startDate — "6:00 GCP, Mon/Wed/Fri"
 * (Guy, 2026-10-14). The timetable is the same each week; holidays and
 * cover are handled per class afterwards (changeSessionCoach / cancel).
 * A class already on the calendar at the same day + time is skipped, so
 * running it again over an existing stretch doesn't double up.
 */
export async function createSessions(input: {
  templateId: string;
  coachId: string;
  startDate: string;
  startTime: string;
  /** Empty = just startDate's own weekday. */
  weekdays: number[];
  weeks: number;
  capacity: number | null;
}): Promise<ScheduleResult> {
  const { supabase } = await requireOwner();

  const { data: template, error: templateError } = await supabase
    .from("session_templates")
    .select("default_duration_minutes, default_capacity")
    .eq("id", input.templateId)
    .maybeSingle();

  if (templateError || !template) {
    return { error: "Session type not found." };
  }

  const weeks = Math.min(Math.max(Math.trunc(input.weeks), 1), 52);
  const capacity = input.capacity ?? template.default_capacity;

  const start = new Date(`${input.startDate}T00:00:00`);
  const startWeekday = (start.getDay() + 6) % 7; // Mon = 0
  const weekdays = [...new Set(input.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  if (weekdays.length === 0) weekdays.push(startWeekday);

  // toLocalDateKey, not toISOString().slice(0, 10) — the latter converts
  // to UTC, which rolls the date back a day whenever the server runs in
  // a positive UTC-offset zone (e.g. BST) since local midnight is the
  // previous day in UTC. See src/lib/format.ts's toLocalDateKey comment
  // for the same footgun on the client side.
  const dates: string[] = [];
  for (let week = 0; week < weeks; week++) {
    for (const weekday of weekdays.sort((a, b) => a - b)) {
      const offset = week * 7 + weekday - startWeekday;
      if (offset < 0) continue; // earlier in the first week than the start date
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      dates.push(toLocalDateKey(date));
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("sessions")
    .select("session_date, start_time")
    .eq("template_id", input.templateId)
    .neq("status", "cancelled")
    .in("session_date", dates);

  if (existingError) {
    return { error: userFacingError(existingError) };
  }

  const taken = new Set((existing ?? []).map((s) => `${s.session_date} ${s.start_time.slice(0, 5)}`));
  const rows = dates
    .filter((date) => !taken.has(`${date} ${input.startTime.slice(0, 5)}`))
    .map((date) => ({
      template_id: input.templateId,
      coach_id: input.coachId,
      session_date: date,
      start_time: input.startTime,
      duration_minutes: template.default_duration_minutes,
      capacity,
      status: "scheduled" as const,
    }));

  if (rows.length > 0) {
    // Relies on RLS ("sessions: create", 0046 — owner only) to actually
    // enforce who can write here — this is the RLS-respecting client,
    // not the admin client, since there's nothing to bypass.
    const { error } = await supabase.from("sessions").insert(rows);

    if (error) {
      return { error: userFacingError(error) };
    }
  }

  return { created: rows.length, skipped: dates.length - rows.length };
}

/**
 * "One" = just this class. "Following" = this class and every later one
 * in its run: same class type, same weekday, same start time, not
 * already cancelled — "all Tuesdays at 6pm" (Guy, 2026-10-20). Classes
 * have no series id, so a run is matched by its shape; that also picks
 * up a slot that was built from two separate "add class" runs.
 */
export type SeriesScope = "one" | "following";

type OwnerClient = Awaited<ReturnType<typeof requireOwner>>["supabase"];

async function sessionIdsInScope(
  supabase: OwnerClient,
  sessionId: string,
  scope: SeriesScope,
): Promise<{ ids: string[] } | { error: string }> {
  if (scope === "one") return { ids: [sessionId] };

  const { data: session, error } = await supabase
    .from("sessions")
    .select("template_id, session_date, start_time")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) {
    return { error: userFacingError(error, "Class not found.") };
  }

  const { data: later, error: laterError } = await supabase
    .from("sessions")
    .select("id, session_date")
    .eq("template_id", session.template_id)
    .eq("start_time", session.start_time)
    .gte("session_date", session.session_date)
    .neq("status", "cancelled");

  if (laterError) {
    return { error: userFacingError(laterError) };
  }

  // Same weekday — PostgREST can't filter on extract(dow), and a run is at
  // most a year of one slot, so filtering here is cheap.
  const weekday = new Date(`${session.session_date}T00:00:00`).getDay();
  const ids = (later ?? [])
    .filter((s) => new Date(`${s.session_date}T00:00:00`).getDay() === weekday)
    .map((s) => s.id);

  return { ids: ids.includes(sessionId) ? ids : [sessionId, ...ids] };
}

/**
 * Cover / holidays (this class only) or a rota change (every later class
 * in the run). "sessions: change" (0046) is owner only.
 */
export async function changeSessionCoach(
  sessionId: string,
  coachId: string,
  scope: SeriesScope = "one",
): Promise<ActionResult & { changed?: number }> {
  const { supabase } = await requireOwner();

  const { data: coach } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", coachId)
    .in("role", ["coach", "owner"])
    .maybeSingle();

  if (!coach) {
    return { error: "Coach not found." };
  }

  const scoped = await sessionIdsInScope(supabase, sessionId, scope);
  if ("error" in scoped) return { error: scoped.error };

  const { error } = await supabase.from("sessions").update({ coach_id: coachId }).in("id", scoped.ids);
  return error ? { error: userFacingError(error) } : { changed: scoped.ids.length };
}

/**
 * Cancelling a session isn't just an update to the sessions row — any
 * member who'd booked (and paid a credit for) it needs that credit back,
 * same as if they'd cancelled it themselves. That refund path touches
 * credit_ledger, which has no policy for anyone but the service role
 * (see 0001), so this needs the admin client even though the sessions
 * update alone wouldn't. Finding which classes are in scope uses the
 * owner's own client — only the writes need the admin one.
 */
export async function cancelSession(
  sessionId: string,
  scope: SeriesScope = "one",
): Promise<ActionResult & { cancelled?: number }> {
  const { supabase, user: staff } = await requireOwner();

  const scoped = await sessionIdsInScope(supabase, sessionId, scope);
  if ("error" in scoped) return { error: scoped.error };

  const admin = createAdminClient();

  const { error: sessionError } = await admin
    .from("sessions")
    .update({ status: "cancelled" })
    .in("id", scoped.ids);

  if (sessionError) {
    return { error: userFacingError(sessionError) };
  }

  const { data: activeBookings, error: bookingsError } = await admin
    .from("bookings")
    .select("id, member_id, credit_ledger_id")
    .in("session_id", scoped.ids)
    .eq("status", "booked");

  if (bookingsError) {
    return { error: userFacingError(bookingsError) };
  }

  for (const booking of activeBookings ?? []) {
    const { error: cancelError } = await admin
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", booking.id);

    if (cancelError) {
      return { error: userFacingError(cancelError) };
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
        return { error: userFacingError(refundError) };
      }
    }
  }

  return { cancelled: scoped.ids.length };
}
