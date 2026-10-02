import type { createClient } from "@/lib/supabase/server";
import { computeWeekStreak } from "@/lib/progress";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const RECENT_DAYS = 28;
const HISTORY_TURNS = 6;
const HISTORY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for a moment, in UK time. */
function ukDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/**
 * "24 Sept 2026, 8 days ago" / "1 Mar 2027, in 150 days, about 5 months".
 * Ted kept getting gaps between dates wrong ("a couple of weeks" for 8
 * days, "years" for 5 months), so the profile spells them out instead of
 * leaving him to count. Exported for the red-team eval's fixed profile.
 */
export function describeDay(isoDate: string, today: Date = new Date()) {
  const day = isoDate.slice(0, 10);
  const label = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${ukDate(today)}T00:00:00Z`)) / DAY_MS);
  const n = Math.abs(diff);
  if (n === 0) return `${label}, today`;
  const count = n === 1 ? "1 day" : `${n} days`;
  const approx =
    n >= 60 ? `, about ${Math.round(n / 30.44)} months` : n >= 14 ? `, about ${Math.round(n / 7)} weeks` : "";
  return diff < 0 ? `${label}, ${count} ago${approx}` : `${label}, in ${count}${approx}`;
}

/** Fitness Blueprint's 1.6-2.2g/kg protein guidance, in grams, to the nearest 5g. */
export function proteinRange(weightKg: number) {
  const g = (x: number) => Math.round((weightKg * x) / 5) * 5;
  return `Protein for them (1.6-2.2g per kg a day): about ${g(1.6)}-${g(2.2)}g a day`;
}

/** The 0.5-1%-of-bodyweight-a-week fat-loss rate, worked out in kg. */
export function safeLossRate(weightKg: number) {
  const r = (x: number) => Math.round(x * 10) / 10;
  const low = weightKg * 0.005;
  const high = weightKg * 0.01;
  return `If they ask about losing weight, the safe rate for them (0.5-1% of bodyweight a week): ${r(low)}-${r(high)}kg a week`;
}

/** "8 weeks" / "10 days" between two dates. */
function spanBetween(fromIso: string, toIso: string) {
  const n = Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / DAY_MS);
  return n >= 14 ? `about ${Math.round(n / 7)} weeks` : `${n} day${n === 1 ? "" : "s"}`;
}

/**
 * What Coach Ted knows about the member he's talking to, as a short plain-
 * text profile for the prompt: goals, recent check-ins, body metrics,
 * attendance and best lifts.
 *
 * Read on the member's own RLS-respecting client — every query here is
 * limited by the "member reads own ..." policies in 0002/0016/0028, so this
 * can only ever describe the signed-in member. Any query that fails just
 * leaves its section out; Ted still answers.
 */
export async function buildMemberProfile(supabase: Supabase, memberId: string): Promise<string> {
  const since = new Date(Date.now() - RECENT_DAYS * DAY_MS);
  const sinceDate = since.toISOString().slice(0, 10);

  const [profile, goals, checkins, metrics, attended, readiness, membership, logs] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", memberId).maybeSingle(),
    supabase
      .from("goals")
      .select("type, metric, long_target, long_date, micro_target, checkin_date, barriers, habits, why")
      .eq("member_id", memberId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("weekly_checkins")
      .select("week_of, weight_kg, energy, sleep, nutrition, win, struggle")
      .eq("member_id", memberId)
      .order("week_of", { ascending: false })
      .limit(2),
    supabase
      .from("body_metrics")
      .select("weight_kg, waist_cm, body_fat_pct, recorded_at")
      .eq("member_id", memberId)
      .order("recorded_at", { ascending: true }),
    supabase.from("bookings").select("session_id").eq("member_id", memberId).eq("status", "attended"),
    supabase
      .from("readiness_checkins")
      .select("feeling, pain_area, sleep_quality, submitted_at")
      .eq("member_id", memberId)
      .gte("submitted_at", since.toISOString())
      .order("submitted_at", { ascending: false })
      .limit(3),
    supabase
      .from("member_memberships")
      .select("membership_plans (name)")
      .eq("member_id", memberId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("exercise_logs")
      .select("exercise_id, weight_kg, reps")
      .eq("member_id", memberId)
      .not("weight_kg", "is", null),
  ]);

  const lines: string[] = [];

  const firstName = profile.data?.full_name?.split(" ")[0];
  if (firstName) lines.push(`Name: ${firstName}`);

  const plan = (membership.data?.membership_plans as { name?: string } | null)?.name;
  if (plan) lines.push(`Membership: ${plan}`);

  for (const g of goals.data ?? []) {
    const parts = [
      // Target values are stored without units; naming the metric next to
      // each stops a lift target being read as a bodyweight one.
      `Goal (${g.type.replace(/_/g, " ")}), measured by ${g.metric}: long-term target ${g.metric} ${g.long_target}${g.long_date ? ` by ${describeDay(g.long_date)}` : ""}`,
      `6-week target ${g.metric} ${g.micro_target} by ${describeDay(g.checkin_date)}`,
    ];
    if (g.habits?.length) parts.push(`habits they chose: ${g.habits.join(", ")}`);
    if (g.barriers) parts.push(`barriers: ${g.barriers}`);
    if (g.why) parts.push(`why it matters to them: ${g.why}`);
    lines.push(parts.join("; "));
  }

  const metricRows = metrics.data ?? [];
  const describeMetric = (key: "weight_kg" | "waist_cm" | "body_fat_pct", label: string, unit: string) => {
    const series = metricRows.filter((r) => r[key] !== null);
    if (!series.length) return;
    const first = series[0]!;
    const last = series[series.length - 1]!;
    const latest = `${label}: ${last[key]}${unit} (${describeDay(last.recorded_at)})`;
    if (series.length === 1) {
      lines.push(latest);
      return;
    }
    const change = Math.round((Number(last[key]) - Number(first[key])) * 10) / 10;
    const direction = change === 0 ? "no change" : `${change < 0 ? "down" : "up"} ${Math.abs(change)}${unit}`;
    lines.push(
      `${latest}, started at ${first[key]}${unit} (${describeDay(first.recorded_at)}): ${direction} over ${spanBetween(first.recorded_at, last.recorded_at)}`
    );
  };
  describeMetric("weight_kg", "Weight", "kg");
  // Ted got sums wrong, so he no longer does any: protein and the safe
  // loss rate are worked out here (see the rules in claude.ts).
  const latestWeight = [...metricRows].reverse().find((r) => r.weight_kg !== null)?.weight_kg;
  if (latestWeight) lines.push(proteinRange(Number(latestWeight)), safeLossRate(Number(latestWeight)));
  describeMetric("waist_cm", "Waist", "cm");
  describeMetric("body_fat_pct", "Body fat", "%");

  const attendedIds = (attended.data ?? []).map((b) => b.session_id);
  if (attendedIds.length) {
    const { data: sessions } = await supabase.from("sessions").select("session_date").in("id", attendedIds);
    const dates = (sessions ?? []).map((s) => s.session_date);
    const recent = dates.filter((d) => d >= sinceDate).length;
    lines.push(
      `Attendance: ${recent} session${recent === 1 ? "" : "s"} in the last 4 weeks, ${dates.length} in total, current streak ${computeWeekStreak(dates)} week(s)`
    );
  } else {
    lines.push("Attendance: no sessions attended yet");
  }

  for (const c of checkins.data ?? []) {
    const parts = [
      `Weekly check-in (${describeDay(c.week_of)}): their own ratings out of 5 (1 = poor, 5 = great; not hours) — energy ${c.energy}/5, sleep ${c.sleep}/5, nutrition ${c.nutrition}/5`,
    ];
    if (c.win) parts.push(`win: ${c.win}`);
    if (c.struggle) parts.push(`struggle: ${c.struggle}`);
    lines.push(parts.join("; "));
  }

  for (const r of readiness.data ?? []) {
    if (r.pain_area) lines.push(`Reported pain before a session (${describeDay(ukDate(new Date(r.submitted_at)))}): ${r.pain_area}`);
  }

  // Heaviest logged set per exercise (weight x reps), not the volume-based
  // records on the Progress tab — "your best squat is 60kg x 5" is what's
  // useful when Ted talks about loads.
  const logRows = logs.data ?? [];
  if (logRows.length) {
    const exerciseIds = [...new Set(logRows.map((l) => l.exercise_id))];
    const { data: exercises } = await supabase.from("session_exercises").select("id, name").in("id", exerciseIds);
    const nameById = new Map((exercises ?? []).map((e) => [e.id, e.name]));
    const best = new Map<string, { kg: number; reps: number | null }>();
    for (const l of logRows) {
      const name = nameById.get(l.exercise_id);
      if (!name || l.weight_kg === null) continue;
      const current = best.get(name);
      if (!current || l.weight_kg > current.kg) best.set(name, { kg: l.weight_kg, reps: l.reps });
    }
    const top = [...best.entries()].sort((a, b) => b[1].kg - a[1].kg).slice(0, 8);
    if (top.length) {
      lines.push(`Heaviest logged sets: ${top.map(([name, b]) => `${name} ${b.kg}kg${b.reps ? ` x ${b.reps}` : ""}`).join(", ")}`);
    }
  }

  return lines.join("\n");
}

export type TedTurn = { question: string; answer: string };

/**
 * The member's last few exchanges with Ted from the past week, oldest
 * first — so Ted can follow up on a question he asked them. Same "members
 * read own ted conversations" policy as the chat page.
 */
export async function recentTedTurns(supabase: Supabase, memberId: string): Promise<TedTurn[]> {
  const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString();
  const { data } = await supabase
    .from("coach_ted_conversations")
    .select("question, answer")
    .eq("member_id", memberId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  return (data ?? []).reverse();
}
