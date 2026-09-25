import type { createClient } from "@/lib/supabase/server";
import { computeWeekStreak } from "@/lib/progress";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const RECENT_DAYS = 28;
const HISTORY_TURNS = 6;
const HISTORY_DAYS = 7;

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
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
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
      `Goal (${g.type.replace(/_/g, " ")}): ${g.metric} — long-term target ${g.long_target}${g.long_date ? ` by ${g.long_date}` : ""}`,
      `6-week target ${g.micro_target} by ${g.checkin_date}`,
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
    const latest = `${label}: ${last[key]}${unit} (${last.recorded_at.slice(0, 10)})`;
    lines.push(series.length > 1 ? `${latest}, started at ${first[key]}${unit} (${first.recorded_at.slice(0, 10)})` : latest);
  };
  describeMetric("weight_kg", "Weight", "kg");
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
    const parts = [`Weekly check-in ${c.week_of}: energy ${c.energy}/5, sleep ${c.sleep}/5, nutrition ${c.nutrition}/5`];
    if (c.win) parts.push(`win: ${c.win}`);
    if (c.struggle) parts.push(`struggle: ${c.struggle}`);
    lines.push(parts.join("; "));
  }

  for (const r of readiness.data ?? []) {
    if (r.pain_area) lines.push(`Reported pain before a session on ${r.submitted_at.slice(0, 10)}: ${r.pain_area}`);
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
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("coach_ted_conversations")
    .select("question, answer")
    .eq("member_id", memberId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  return (data ?? []).reverse();
}
