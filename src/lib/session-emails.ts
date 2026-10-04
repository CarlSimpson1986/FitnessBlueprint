import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeHtml } from "@/lib/html";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { publicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { sessionIcs } from "@/lib/calendar-feed";
import type { Database } from "@/types/database.types";

/**
 * Emails about a member's own sessions: booking confirmation (sent from the
 * booking actions), the evening-before reminder (cron) and a waitlist
 * place opening up (database webhook, 0051).
 */

export type SessionInfo = {
  className: string;
  coachName: string | null;
  sessionDate: string;
  startTime: string;
};

function firstName(fullName: string) {
  return escapeHtml(fullName.split(" ")[0] ?? fullName);
}

function when(s: SessionInfo) {
  return escapeHtml(`${formatSessionDate(s.sessionDate)} at ${formatSessionTime(s.startTime)}`);
}

function withCoach(s: SessionInfo) {
  return s.coachName ? ` with ${escapeHtml(s.coachName.split(" ")[0] ?? s.coachName)}` : "";
}

function shell(body: string) {
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  ${body}
</div>`.trim();
}

function button(url: string, label: string) {
  return `<p style="margin:28px 0"><a href="${url}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">${label}</a></p>`;
}

export function bookingConfirmationHtml(name: string, s: SessionInfo) {
  return shell(`
  <h1 style="font-size:22px;margin:0 0 16px">You're booked in, ${firstName(name)}</h1>
  <p style="font-size:16px;line-height:1.5"><strong>${escapeHtml(s.className)}</strong>, ${when(s)}${withCoach(s)}.</p>
  <p style="font-size:16px;line-height:1.5">It's attached as a calendar event — tap it to add it to your calendar.</p>
  ${button(`${publicEnv.NEXT_PUBLIC_SITE_URL}/sessions`, "See my bookings")}
  <p style="font-size:13px;line-height:1.5;color:#666">Can't make it? Please cancel in the app at least 3 hours before the class — later than that, it still counts as used.</p>`);
}

export function sessionReminderHtml(name: string, s: SessionInfo, checkedIn: boolean) {
  const checkin = checkedIn
    ? ""
    : `<p style="font-size:16px;line-height:1.5">Before you come in, do your 10-second pre-session check-in so your coach knows how you're feeling.</p>
  ${button(`${publicEnv.NEXT_PUBLIC_SITE_URL}/`, "Do my check-in")}`;
  return shell(`
  <h1 style="font-size:22px;margin:0 0 16px">See you tomorrow, ${firstName(name)}</h1>
  <p style="font-size:16px;line-height:1.5"><strong>${escapeHtml(s.className)}</strong>, ${when(s)}${withCoach(s)}.</p>
  ${checkin}
  <p style="font-size:13px;line-height:1.5;color:#666">Can't make it? Please cancel in the app at least 3 hours before the class — later than that, it still counts as used.</p>`);
}

export function waitlistOfferHtml(name: string, s: SessionInfo, expiresAt: Date) {
  const until = expiresAt.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  return shell(`
  <h1 style="font-size:22px;margin:0 0 16px">A place has opened up, ${firstName(name)}</h1>
  <p style="font-size:16px;line-height:1.5"><strong>${escapeHtml(s.className)}</strong>, ${when(s)}${withCoach(s)} — it's yours if you want it.</p>
  <p style="font-size:16px;line-height:1.5">Accept by <strong>${escapeHtml(until)}</strong>, or it goes to the next person on the waitlist.</p>
  ${button(`${publicEnv.NEXT_PUBLIC_SITE_URL}/sessions`, "Grab my place")}`);
}

/**
 * Sends the signed-in member their booking confirmation with a calendar
 * file. Uses their own RLS client: "profiles: read" (own row), sessions and
 * session_templates (any member), list_coach_names() (0011). Never throws —
 * the booking has already happened; a failed email is only logged.
 */
export async function sendBookingConfirmation(supabase: SupabaseClient<Database>, sessionId: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: session }, { data: coaches }] = await Promise.all([
      supabase.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle(),
      supabase
        .from("sessions")
        .select("session_date, start_time, duration_minutes, template_id, coach_id")
        .eq("id", sessionId)
        .maybeSingle(),
      supabase.rpc("list_coach_names"),
    ]);
    if (!profile?.email || !session) return;

    const { data: template } = await supabase
      .from("session_templates")
      .select("name")
      .eq("id", session.template_id)
      .maybeSingle();

    const info: SessionInfo = {
      className: template?.name ?? "Your session",
      coachName: (coaches ?? []).find((c) => c.id === session.coach_id)?.full_name ?? null,
      sessionDate: session.session_date,
      startTime: session.start_time,
    };

    const { error } = await sendEmail({
      to: profile.email,
      subject: `Booked: ${info.className}, ${formatSessionDate(info.sessionDate)} ${formatSessionTime(info.startTime)}`,
      html: bookingConfirmationHtml(profile.full_name, info),
      attachments: [
        {
          name: "fitness-blueprint-session.ics",
          content: sessionIcs({
            sessionId,
            memberId: user.id,
            className: info.className,
            coachName: info.coachName,
            sessionDate: info.sessionDate,
            startTime: info.startTime,
            durationMinutes: session.duration_minutes,
            siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
          }),
        },
      ],
    });
    if (error) console.error("sendBookingConfirmation: email failed —", error);
  } catch (err) {
    console.error("sendBookingConfirmation failed —", err);
  }
}
