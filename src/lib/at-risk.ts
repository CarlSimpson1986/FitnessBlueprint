import type { createClient } from "@/lib/supabase/server";
import { isInternalAddress } from "@/lib/email";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const NO_SHOW_DAYS = 14;

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

function daysSince(dateKey: string, todayKey: string) {
  return Math.round((new Date(`${todayKey}T00:00:00Z`).getTime() - new Date(`${dateKey}T00:00:00Z`).getTime()) / DAY_MS);
}

/**
 * Members with an active plan who look like they're drifting away:
 * no session attended in NO_SHOW_DAYS days and nothing booked
 * (notTraining), plus members still training but not checking in — no
 * weekly check-in or body-metrics log for 2 weeks, the same rule as the
 * Monday quiet-member email in src/app/api/cron/reminders/route.ts.
 * Shared by /owner/at-risk and the owner dashboard highlights. Pass the
 * owner's RLS-respecting client: every table here has an
 * is_coach_or_owner() read policy (0002/0016/0028).
 */
export async function computeAtRisk(supabase: Supabase) {
  const now = new Date();
  const todayKey = ukDateKey(now);
  const twoWeeksAgoKey = ukDateKey(new Date(now.getTime() - NO_SHOW_DAYS * DAY_MS));

  const [{ data: members }, { data: activeMemberships }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").eq("role", "member"),
    supabase.from("member_memberships").select("member_id, plan_id").eq("status", "active"),
    supabase.from("membership_plans").select("id, name"),
  ]);

  const planName = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const planByMember = new Map((activeMemberships ?? []).map((m) => [m.member_id, planName.get(m.plan_id) ?? ""]));
  const activeMembers = (members ?? []).filter(
    (m) => planByMember.has(m.id) && !(m.email && isInternalAddress(m.email))
  );
  const memberIds = activeMembers.map((m) => m.id);

  const [{ data: bookings }, { data: checkins }, { data: metrics }] = memberIds.length
    ? await Promise.all([
        supabase.from("bookings").select("member_id, session_id, status").in("member_id", memberIds).in("status", ["attended", "booked"]),
        supabase.from("weekly_checkins").select("member_id, week_of").in("member_id", memberIds).gte("week_of", twoWeeksAgoKey),
        supabase.from("body_metrics").select("member_id, recorded_at").in("member_id", memberIds).gte("recorded_at", `${twoWeeksAgoKey}T00:00:00Z`),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const sessionIds = [...new Set((bookings ?? []).map((b) => b.session_id))];
  const { data: sessions } = sessionIds.length
    ? await supabase.from("sessions").select("id, session_date").in("id", sessionIds)
    : { data: [] };
  const sessionDate = new Map((sessions ?? []).map((s) => [s.id, s.session_date]));

  const lastAttended = new Map<string, string>();
  const hasUpcoming = new Set<string>();
  for (const b of bookings ?? []) {
    const date = sessionDate.get(b.session_id);
    if (!date) continue;
    if (b.status === "attended" && date > (lastAttended.get(b.member_id) ?? "")) lastAttended.set(b.member_id, date);
    if (b.status === "booked" && date >= todayKey) hasUpcoming.add(b.member_id);
  }

  const checkedInRecently = new Set([
    ...(checkins ?? []).map((c) => c.member_id),
    ...(metrics ?? []).map((m) => m.member_id),
  ]);

  const rows = activeMembers.map((m) => {
    const last = lastAttended.get(m.id) ?? null;
    return {
      ...m,
      plan: planByMember.get(m.id) ?? "",
      lastAttended: last,
      daysAway: last ? daysSince(last, todayKey) : null,
      hasUpcoming: hasUpcoming.has(m.id),
      checkedIn: checkedInRecently.has(m.id),
    };
  });

  const notTraining = rows
    .filter((r) => !r.hasUpcoming && (r.daysAway === null || r.daysAway >= NO_SHOW_DAYS))
    .sort((a, b) => (b.daysAway ?? 100000) - (a.daysAway ?? 100000));
  const notTrainingIds = new Set(notTraining.map((r) => r.id));
  const notCheckingIn = rows.filter((r) => !notTrainingIds.has(r.id) && !r.checkedIn);

  return { notTraining, notCheckingIn };
}

export type AtRiskRow = Awaited<ReturnType<typeof computeAtRisk>>["notTraining"][number];
