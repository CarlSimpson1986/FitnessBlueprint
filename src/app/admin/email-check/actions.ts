"use server";

import { requireOwner } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { publicEnv, serverEnv } from "@/lib/env";
import { buildMondayDigest } from "@/lib/monday-digest";
import { buildMonthlyReport, monthlyReportHtml, monthlyReportSubject, previousMonth } from "@/lib/monthly-progress";

export type ActionResult = { error?: string; sentTo?: string };

/**
 * Owner-only: sends one email through Brevo to the owner's own address,
 * so "is Brevo actually working" is a click rather than waiting for the
 * reminders cron and hoping.
 */
export async function sendTestEmail(): Promise<ActionResult> {
  const { profile } = await requireOwner();
  const env = serverEnv();

  // Say exactly which setting is wrong — names and shapes only, never values.
  const key = (env.BREVO_API_KEY ?? "").trim();
  const sender = (env.BREVO_SENDER_EMAIL ?? "").trim();
  const problems = [
    !key
      ? "BREVO_API_KEY is empty on this deployment"
      : key.startsWith("xsmtpsib-")
        ? "BREVO_API_KEY is the SMTP key (xsmtpsib-) — it needs the API key (xkeysib-)"
        : !key.startsWith("xkeysib-")
          ? "BREVO_API_KEY doesn't look like a Brevo API key (should start xkeysib-)"
          : "",
    !sender ? "BREVO_SENDER_EMAIL is empty on this deployment" : !sender.includes("@") ? "BREVO_SENDER_EMAIL isn't an email address" : "",
  ].filter(Boolean);
  if (problems.length) {
    return { error: `Brevo setup problem: ${problems.join("; ")}.` };
  }
  if (!profile.email) {
    return { error: "Your profile has no email address." };
  }

  const result = await sendEmail({
    to: profile.email,
    subject: "Fitness Blueprint — test email",
    html: `<p>This is a test from Fitness Blueprint. If you're reading it, Brevo is working.</p><p>Sent from: ${env.BREVO_SENDER_EMAIL}</p>`,
  });
  return result.error ? { error: result.error } : { sentTo: profile.email };
}

export type PreviewResult = { error?: string; sentTo?: string; memberName?: string };

/**
 * Owner-only: emails the owner last month's progress report for the
 * member who trained most, so Guy sees exactly what members will get
 * before the first real send (1 Nov). Reads through the owner's RLS
 * client — "coaches and owner read all" bookings, sessions and exercise
 * logs (0002/0015) — no admin client needed.
 */
export async function sendMonthlyReportPreview(): Promise<PreviewResult> {
  const { supabase, profile } = await requireOwner();
  if (!profile.email) {
    return { error: "Your profile has no email address." };
  }

  const ukToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const month = previousMonth(ukToday);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id")
    .gte("session_date", month.start)
    .lte("session_date", month.end);
  const sessionIds = (sessions ?? []).map((s) => s.id);

  const countByMember = new Map<string, number>();
  for (let i = 0; i < sessionIds.length; i += 100) {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("member_id")
      .eq("status", "attended")
      .in("session_id", sessionIds.slice(i, i + 100));
    for (const b of bookings ?? []) countByMember.set(b.member_id, (countByMember.get(b.member_id) ?? 0) + 1);
  }
  const busiest = [...countByMember.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!busiest) {
    return { error: `Nobody attended a session in ${month.label}, so there's nothing to preview.` };
  }

  const { data: member } = await supabase.from("profiles").select("full_name").eq("id", busiest[0]).single();
  const memberName = member?.full_name ?? "Member";

  try {
    const report = await buildMonthlyReport(supabase, busiest[0], month);
    const result = await sendEmail({
      to: profile.email,
      subject: `[Preview — ${memberName}] ${monthlyReportSubject(report)}`,
      html: monthlyReportHtml(memberName, report, `${publicEnv.NEXT_PUBLIC_SITE_URL}/progress`),
    });
    return result.error ? { error: result.error } : { sentTo: profile.email, memberName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't build the report." };
  }
}

/**
 * Owner-only: emails the owner what Monday's digest would say right now
 * (src/lib/monday-digest.ts), on the owner's RLS client — the at-risk
 * and conversions tables all have owner read policies.
 */
export async function sendMondayDigestPreview(): Promise<ActionResult> {
  const { supabase, profile } = await requireOwner();
  if (!profile.email) {
    return { error: "Your profile has no email address." };
  }
  try {
    const digest = await buildMondayDigest(supabase, publicEnv.NEXT_PUBLIC_SITE_URL);
    if (!digest) {
      return { error: "Nobody would be listed right now, so Monday's email wouldn't go out." };
    }
    const result = await sendEmail({
      to: profile.email,
      subject: `[Preview] ${digest.subject}`,
      html: digest.html(profile.full_name.split(" ")[0] ?? profile.full_name),
    });
    return result.error ? { error: result.error } : { sentTo: profile.email };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't build the digest." };
  }
}
