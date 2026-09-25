import type { createClient } from "@/lib/supabase/server";
import { computeAtRisk } from "@/lib/at-risk";
import { fetchTimeOff } from "@/lib/time-off";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 28;
const ENDING_SOON_DAYS = 7;
// Same "a spot is taken" rule as session economics (src/lib/session-economics.ts).
const OCCUPIED = new Set(["booked", "attended", "no_show", "excused", "invited"]);
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type SlotStat = { label: string; fillPct: number; sessions: number };

/**
 * Headline numbers for the top of the owner dashboard, all computed at
 * read time from existing tables (no stored counters):
 * - busiest / quietest regular slot over the last 4 weeks (class type +
 *   weekday + time, by average fill),
 * - this week's bookings against capacity,
 * - members slipping away (src/lib/at-risk.ts),
 * - 6-week programmes finishing in the next 7 days (conversion chances).
 * Pass the owner's RLS-respecting client — sessions, bookings,
 * memberships and profiles are all readable by is_coach_or_owner().
 */
export async function fetchOwnerHighlights(supabase: Supabase) {
  const now = new Date();
  const todayKey = ukDateKey(now);
  const lookbackKey = ukDateKey(new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS));
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(todayKey, -((dow + 6) % 7));
  const weekEnd = addDays(weekStart, 6);

  const [{ data: sessions }, { data: types }, atRisk, { data: plans }, timeOff] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, session_date, start_time, capacity, template_id")
      .neq("status", "cancelled")
      .gte("session_date", lookbackKey)
      .lte("session_date", weekEnd),
    supabase.from("session_templates").select("id, name"),
    computeAtRisk(supabase),
    supabase.from("membership_plans").select("id, programme_length_days").not("programme_length_days", "is", null),
    fetchTimeOff(supabase, todayKey, addDays(todayKey, 13)),
  ]);

  const sessionRows = sessions ?? [];
  const { data: bookings } = sessionRows.length
    ? await supabase.from("bookings").select("session_id, status").in("session_id", sessionRows.map((s) => s.id))
    : { data: [] };
  const taken = new Map<string, number>();
  for (const b of bookings ?? []) {
    if (OCCUPIED.has(b.status)) taken.set(b.session_id, (taken.get(b.session_id) ?? 0) + 1);
  }
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));

  // Regular slots, from sessions that have already happened.
  const slots = new Map<string, { taken: number; capacity: number; sessions: number }>();
  for (const s of sessionRows) {
    if (s.session_date >= todayKey || !s.capacity) continue;
    const weekday = WEEKDAY[new Date(`${s.session_date}T00:00:00Z`).getUTCDay()];
    const label = `${typeName.get(s.template_id) ?? "Session"} · ${weekday} ${s.start_time.slice(0, 5)}`;
    const slot = slots.get(label) ?? { taken: 0, capacity: 0, sessions: 0 };
    slot.taken += taken.get(s.id) ?? 0;
    slot.capacity += s.capacity;
    slot.sessions += 1;
    slots.set(label, slot);
  }
  const slotStats: SlotStat[] = [...slots.entries()]
    .map(([label, v]) => ({ label, fillPct: Math.round((v.taken / v.capacity) * 100), sessions: v.sessions }))
    .sort((a, b) => b.fillPct - a.fillPct);
  const busiest = slotStats[0] ?? null;
  const quietest = slotStats.length > 1 ? slotStats[slotStats.length - 1]! : null;

  const thisWeek = sessionRows.filter((s) => s.session_date >= weekStart && s.session_date <= weekEnd);
  const weekBooked = thisWeek.reduce((sum, s) => sum + (taken.get(s.id) ?? 0), 0);
  const weekCapacity = thisWeek.reduce((sum, s) => sum + (s.capacity ?? 0), 0);

  // 6-week programmes whose last day falls within the next week.
  const lengthByPlan = new Map((plans ?? []).map((p) => [p.id, p.programme_length_days ?? 0]));
  const { data: programmes } = lengthByPlan.size
    ? await supabase
        .from("member_memberships")
        .select("member_id, plan_id, started_at")
        .eq("status", "active")
        .in("plan_id", [...lengthByPlan.keys()])
    : { data: [] };
  const endingSoonRaw = (programmes ?? [])
    .map((m) => {
      const lastDay = addDays(ukDateKey(new Date(m.started_at)), (lengthByPlan.get(m.plan_id) ?? 0) - 1);
      const daysLeft = Math.round((new Date(`${lastDay}T00:00:00Z`).getTime() - new Date(`${todayKey}T00:00:00Z`).getTime()) / DAY_MS);
      return { memberId: m.member_id, daysLeft };
    })
    .filter((m) => m.daysLeft >= 0 && m.daysLeft <= ENDING_SOON_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const { data: endingProfiles } = endingSoonRaw.length
    ? await supabase.from("profiles").select("id, full_name").in("id", endingSoonRaw.map((m) => m.memberId))
    : { data: [] };
  const nameById = new Map((endingProfiles ?? []).map((p) => [p.id, p.full_name]));
  const endingSoon = endingSoonRaw.map((m) => ({ name: nameById.get(m.memberId) ?? "Member", daysLeft: m.daysLeft }));

  // Coaches off in the next two weeks, and how many of their sessions
  // in that window still need cover.
  const offIds = [...new Set(timeOff.map((t) => t.coach_id))];
  const [{ data: offProfiles }, { data: offSessions }] = offIds.length
    ? await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", offIds),
        supabase
          .from("sessions")
          .select("coach_id, session_date")
          .eq("status", "scheduled")
          .gte("session_date", todayKey)
          .lte("session_date", addDays(todayKey, 13))
          .in("coach_id", offIds),
      ])
    : [{ data: [] }, { data: [] }];
  const offName = new Map((offProfiles ?? []).map((p) => [p.id, p.full_name]));
  const coachesOff = timeOff.map((t) => ({
    name: offName.get(t.coach_id) ?? "Coach",
    startsOn: t.starts_on,
    endsOn: t.ends_on,
    needsCover: (offSessions ?? []).filter(
      (s) => s.coach_id === t.coach_id && s.session_date >= t.starts_on && s.session_date <= t.ends_on
    ).length,
  }));

  return {
    coachesOff,
    busiest,
    quietest,
    week: { booked: weekBooked, capacity: weekCapacity, sessions: thisWeek.length },
    slipping: atRisk.notTraining.map((r) => ({ name: r.full_name, daysAway: r.daysAway })),
    notCheckingIn: atRisk.notCheckingIn.length,
    endingSoon,
  };
}
