import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInternalAddress } from "@/lib/email";
import { sendOnce } from "@/lib/email-log";
import { serverEnv } from "@/lib/env";
import { formatSessionTime } from "@/lib/format";
import { sessionReminderHtml } from "@/lib/session-emails";

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

/**
 * Evening-before session reminders (see vercel.json, 17:00 UTC = 6pm BST /
 * 5pm GMT): everyone booked into a class tomorrow, UK time, with a nudge to
 * do the pre-session check-in if they haven't. Admin client — a scheduled
 * job, the use admin.ts allows. Idempotent via email_log (one per member
 * per session), so a re-run never double-sends.
 */
export async function GET(request: Request) {
  const env = serverEnv();
  // Fail closed: without CRON_SECRET anyone could trigger the emails.
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tomorrow = ukDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, start_time, template_id, coach_id")
    .eq("session_date", tomorrow)
    .eq("status", "scheduled");
  if (!sessions?.length) return NextResponse.json({ tomorrow, sent: 0 });

  const sessionIds = sessions.map((s) => s.id);
  const [{ data: bookings }, { data: templates }, { data: coaches }, { data: readiness }] = await Promise.all([
    supabase.from("bookings").select("session_id, member_id").in("session_id", sessionIds).eq("status", "booked"),
    supabase.from("session_templates").select("id, name").in("id", [...new Set(sessions.map((s) => s.template_id))]),
    supabase.from("profiles").select("id, full_name").in("id", [...new Set(sessions.map((s) => s.coach_id))]),
    supabase.from("readiness_checkins").select("session_id, member_id").in("session_id", sessionIds),
  ]);

  const memberIds = [...new Set((bookings ?? []).map((b) => b.member_id))];
  const { data: members } = memberIds.length
    ? await supabase.from("profiles").select("id, email, full_name").in("id", memberIds)
    : { data: [] };

  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const className = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const coachName = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m]));
  const checkedIn = new Set((readiness ?? []).map((r) => `${r.session_id}:${r.member_id}`));

  const results = { tomorrow, sent: 0, already: 0, failed: 0 };
  for (const booking of bookings ?? []) {
    const member = memberById.get(booking.member_id);
    const session = sessionById.get(booking.session_id);
    if (!member?.email || !session || isInternalAddress(member.email)) continue;

    const info = {
      className: className.get(session.template_id) ?? "Your session",
      coachName: coachName.get(session.coach_id) ?? null,
      sessionDate: session.session_date,
      startTime: session.start_time,
    };
    const outcome = await sendOnce(
      supabase,
      { recipient_id: member.id, email_type: "session_reminder", reference_key: session.id },
      {
        to: member.email,
        subject: `Tomorrow: ${info.className} at ${formatSessionTime(info.startTime)}`,
        html: sessionReminderHtml(member.full_name, info, checkedIn.has(`${session.id}:${member.id}`)),
      }
    );
    results[outcome === "sent" ? "sent" : outcome === "already" ? "already" : "failed"]++;
  }

  return NextResponse.json(results);
}
