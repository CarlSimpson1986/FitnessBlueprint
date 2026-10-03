import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { isInternalAddress } from "@/lib/email";

type Supabase = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const NO_SHOW_DAYS = 14;
// `.in()` lists go in the URL, and PostgREST caps each response at 1000
// rows — so ids go in chunks and per-member history is fetched in pages.
const IN_CHUNK = 100;
const PAGE_SIZE = 1000;

async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

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
 * old Monday quiet-member email.
 * Shared by /owner/at-risk, the owner dashboard highlights and the
 * Monday at-risk digest email. Pass the owner's RLS-respecting client
 * (every table here has an is_coach_or_owner() read policy, 0002/0016/
 * 0028) or, from the cron, the admin client.
 */
export async function computeAtRisk(supabase: Supabase) {
  const now = new Date();
  const todayKey = ukDateKey(now);
  const twoWeeksAgoKey = ukDateKey(new Date(now.getTime() - NO_SHOW_DAYS * DAY_MS));

  const [{ data: members }, { data: activeMemberships }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone, health_consent").eq("role", "member"),
    supabase.from("member_memberships").select("member_id, plan_id").eq("status", "active"),
    supabase.from("membership_plans").select("id, name"),
  ]);

  const planName = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const planByMember = new Map((activeMemberships ?? []).map((m) => [m.member_id, planName.get(m.plan_id) ?? ""]));
  const activeMembers = (members ?? []).filter(
    (m) => planByMember.has(m.id) && !(m.email && isInternalAddress(m.email))
  );
  const memberIds = activeMembers.map((m) => m.id);

  // Who's been in or is booked: bookings on sessions from two weeks ago
  // onwards. That's a bounded set, unlike every booking ever made.
  const { data: recentSessions } = await supabase
    .from("sessions")
    .select("id, session_date")
    .gte("session_date", twoWeeksAgoKey);
  const sessionDate = new Map((recentSessions ?? []).map((s) => [s.id, s.session_date]));

  const [recentBookings, checkins, metrics] = await Promise.all([
    inChunks([...sessionDate.keys()], (chunk) =>
      supabase.from("bookings").select("member_id, session_id, status").in("session_id", chunk).in("status", ["attended", "booked"])
    ),
    inChunks(memberIds, (chunk) =>
      supabase.from("weekly_checkins").select("member_id, week_of").in("member_id", chunk).gte("week_of", twoWeeksAgoKey)
    ),
    inChunks(memberIds, (chunk) =>
      supabase.from("body_metrics").select("member_id, recorded_at").in("member_id", chunk).gte("recorded_at", `${twoWeeksAgoKey}T00:00:00Z`)
    ),
  ]);

  const lastAttended = new Map<string, string>();
  const hasUpcoming = new Set<string>();
  for (const b of recentBookings) {
    const date = sessionDate.get(b.session_id);
    if (!date) continue;
    if (b.status === "attended" && date > (lastAttended.get(b.member_id) ?? "")) lastAttended.set(b.member_id, date);
    if (b.status === "booked" && date >= todayKey) hasUpcoming.add(b.member_id);
  }

  // Everyone else: when were they last in at all? Only these members'
  // history is needed, newest first, one row each.
  const quietIds = memberIds.filter((id) => !lastAttended.has(id) && !hasUpcoming.has(id));
  for (const id of quietIds) {
    const { data: attended } = await supabase
      .from("bookings")
      .select("session_id")
      .eq("member_id", id)
      .eq("status", "attended")
      .range(0, PAGE_SIZE - 1);
    const ids = (attended ?? []).map((b) => b.session_id);
    if (!ids.length) continue;
    const dates = await inChunks(ids, (chunk) => supabase.from("sessions").select("session_date").in("id", chunk));
    const latest = dates.map((d) => d.session_date).sort().at(-1);
    if (latest) lastAttended.set(id, latest);
  }

  const checkedInRecently = new Set([
    ...checkins.map((c) => c.member_id),
    ...metrics.map((m) => m.member_id),
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
  // Members who said no to health info (0043) can't check in, so they're never "not checking in".
  const notCheckingIn = rows.filter((r) => !notTrainingIds.has(r.id) && !r.checkedIn && r.health_consent !== false);

  return { notTraining, notCheckingIn };
}

export type AtRiskRow = Awaited<ReturnType<typeof computeAtRisk>>["notTraining"][number];
