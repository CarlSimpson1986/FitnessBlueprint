import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInternalAddress, sendEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { mondayOf, weekKey } from "@/lib/progress";
import { toLocalDateKey } from "@/lib/format";
import type { Database } from "@/types/database.types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Europe/London "now", represented as a Date whose local wall-clock parts
 * match London's — same trick as toLocalDateKey (src/lib/format.ts) for
 * avoiding UTC-conversion day-boundary bugs, just for "now" instead of a
 * date-only value. This route runs on Vercel (UTC), but day-of-week/date
 * gating below needs to match the UK gym's actual calendar day.
 */
function londonNow(): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

type AdminClient = ReturnType<typeof createAdminClient>;
type EmailLogRow = Pick<
  Database["public"]["Tables"]["email_log"]["Insert"],
  "recipient_id" | "email_type" | "reference_key"
>;

/**
 * Claims the email_log row, then sends. The row is what makes retries
 * idempotent (unique on recipient/type/reference), but it must only stand
 * if the send actually worked — otherwise a Brevo failure would be
 * recorded as sent and never retried. On failure the claim is released
 * so tomorrow's run tries again, and the error is logged.
 */
async function sendOnce(
  supabase: AdminClient,
  log: EmailLogRow,
  email: { to: string; subject: string; html: string }
): Promise<"sent" | "already" | "failed"> {
  const { error: logError } = await supabase.from("email_log").insert(log);
  if (logError) return "already"; // unique violation = already sent

  const { error } = await sendEmail(email);
  if (error) {
    console.error(`reminders: ${log.email_type} to ${email.to} failed — ${error}`);
    await supabase
      .from("email_log")
      .delete()
      .eq("recipient_id", log.recipient_id)
      .eq("email_type", log.email_type)
      .eq("reference_key", log.reference_key);
    return "failed";
  }
  return "sent";
}

function firstName(fullName: string) {
  return fullName.split(" ")[0];
}

/**
 * Daily reminders cron (see vercel.json). Uses the admin client — a
 * scheduled job has no member session to be RLS-scoped to, and needs to
 * scan across every member; "scheduled jobs" is explicitly listed as a
 * legitimate admin-client use case in src/lib/supabase/admin.ts already.
 * Idempotent via email_log's unique constraint (0021) — safe to re-run.
 */
export async function GET(request: Request) {
  const env = serverEnv();
  const authHeader = request.headers.get("authorization");
  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = londonNow();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
  const todayKey = toLocalDateKey(now);

  const results = { goalCheckins: 0, sundayReminders: 0, quietAlerts: 0, failed: 0 };

  // ---------------------------------------------------------------------
  // 1. Goal check-in due — every day, one email per goal (not repeated
  // daily if the member never acts; the in-app banner covers the rest).
  // ---------------------------------------------------------------------
  const { data: dueGoals } = await supabase
    .from("goals")
    .select("id, member_id, metric, checkin_date")
    .eq("status", "active")
    .lte("checkin_date", todayKey);

  if (dueGoals && dueGoals.length > 0) {
    const memberIds = [...new Set(dueGoals.map((g) => g.member_id))];
    const { data: members } = await supabase.from("profiles").select("id, email, full_name").in("id", memberIds);
    const memberById = new Map((members ?? []).map((m) => [m.id, m]));

    for (const goal of dueGoals) {
      const member = memberById.get(goal.member_id);
      if (!member?.email) continue;

      const outcome = await sendOnce(
        supabase,
        { recipient_id: member.id, email_type: "goal_checkin_due", reference_key: goal.id },
        {
            to: member.email,
            subject: "Your 6-week check-in is here",
            html: `<p>Hey ${firstName(member.full_name)},</p><p>Your 6-week check-in for ${goal.metric} is due — open the app and set your next target with Coach Ted.</p>`,
        }
      );
      if (outcome === "sent") results.goalCheckins++;
      if (outcome === "failed") results.failed++;
    }
  }

  // ---------------------------------------------------------------------
  // 2. Sunday check-in reminder — members with no body_metrics row yet
  // this week (Mon-start).
  // ---------------------------------------------------------------------
  if (dayOfWeek === 0) {
    const weekStartKey = toLocalDateKey(mondayOf(now));
    const [{ data: members }, { data: loggedRows }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").eq("role", "member"),
      supabase.from("body_metrics").select("member_id").gte("recorded_at", `${weekStartKey}T00:00:00Z`),
    ]);
    const loggedMemberIds = new Set((loggedRows ?? []).map((r) => r.member_id));

    for (const member of members ?? []) {
      if (loggedMemberIds.has(member.id) || !member.email) continue;

      const outcome = await sendOnce(
        supabase,
        { recipient_id: member.id, email_type: "sunday_checkin_reminder", reference_key: weekStartKey },
        {
            to: member.email,
            subject: "Time for your weekly check-in",
            html: `<p>Hey ${firstName(member.full_name)},</p><p>Quick one — log this week's weight, waist, or body fat % in the app whenever you've got a moment.</p>`,
        }
      );
      if (outcome === "sent") results.sundayReminders++;
      if (outcome === "failed") results.failed++;
    }
  }

  // ---------------------------------------------------------------------
  // 3. Quiet-member alert to the owner — Mondays only, right after the
  // previous 2 complete weeks close. Checks the 2 PREVIOUS weeks, not the
  // current partial one, to avoid flagging someone mid-week.
  // ---------------------------------------------------------------------
  if (dayOfWeek === 1) {
    const week1Start = toLocalDateKey(mondayOf(new Date(now.getTime() - 7 * DAY_MS)));
    const week2Start = toLocalDateKey(mondayOf(new Date(now.getTime() - 14 * DAY_MS)));

    // Every owner-role profile, not just one — CLAUDE.md's role model
    // describes a single owner, but the app doesn't actually constrain
    // that at the DB level, so this stays correct if it's ever untrue.
    const [{ data: members }, { data: recentLogs }, { data: owners }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("role", "member"),
      supabase.from("body_metrics").select("member_id, recorded_at").gte("recorded_at", `${week2Start}T00:00:00Z`),
      supabase.from("profiles").select("id, email, full_name").eq("role", "owner"),
    ]);

    const ownersWithEmail = (owners ?? []).filter(
      (o): o is typeof o & { email: string } => o.email !== null
    );

    if (ownersWithEmail.length > 0) {
      const weeksLoggedByMember = new Map<string, Set<string>>();
      for (const log of recentLogs ?? []) {
        const wk = weekKey(new Date(log.recorded_at));
        const set = weeksLoggedByMember.get(log.member_id) ?? new Set<string>();
        set.add(wk);
        weeksLoggedByMember.set(log.member_id, set);
      }

      for (const member of members ?? []) {
        // Demo/test accounts never check in — don't alert the owner about them.
        if (member.email && isInternalAddress(member.email)) continue;
        const loggedWeeks = weeksLoggedByMember.get(member.id) ?? new Set<string>();
        const missedBothWeeks = !loggedWeeks.has(week1Start) && !loggedWeeks.has(week2Start);
        if (!missedBothWeeks) continue;

        for (const owner of ownersWithEmail) {
          const outcome = await sendOnce(
            supabase,
            {
              recipient_id: owner.id,
              email_type: "coach_quiet_member_alert",
              reference_key: `${member.id}:${week1Start}`,
            },
            {
                to: owner.email,
                subject: `${member.full_name} has gone quiet on check-ins`,
                html: `<p>${member.full_name} hasn't logged a weekly check-in for 2 weeks running.</p>`,
            }
          );
          if (outcome === "sent") results.quietAlerts++;
          if (outcome === "failed") results.failed++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
