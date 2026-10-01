import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { computeWeekStreak, loggedKg, type LoggedSet } from "@/lib/progress";
import type { MetricType } from "@/lib/workout-content";

/**
 * Monthly progress email (0036): last month's sessions, week streak,
 * total lifted and new bests, for one member. Strength, fitness and
 * attendance only — no body weight, per the spec ("we try not to put too
 * much focus on weight loss / body image").
 *
 * Takes either the admin client (the daily cron, no session) or the
 * owner's RLS client (the preview on /admin — "coaches and owner read
 * all" bookings and exercise logs, 0002/0015). Same numbers either way.
 */

type Client = SupabaseClient<Database>;

// PostgREST returns at most 1000 rows per request; `.in()` lists go in the
// URL, so keep them short.
const PAGE_SIZE = 1000;
const IN_CHUNK = 100;

export type ReportMonth = {
  /** "2026-09" — the email_log reference key. */
  key: string;
  start: string;
  end: string;
  previousStart: string;
  label: string;
  previousLabel: string;
};

/** The calendar month before `ukToday` (YYYY-MM-DD, UK date). */
export function previousMonth(ukToday: string): ReportMonth {
  const [year = 1970, month = 1] = ukToday.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 2, 1));
  const end = new Date(Date.UTC(year, month - 1, 0));
  const previousStart = new Date(Date.UTC(year, month - 3, 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const name = (d: Date) => d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return {
    key: iso(start).slice(0, 7),
    start: iso(start),
    end: iso(end),
    previousStart: iso(previousStart),
    label: name(start),
    previousLabel: name(previousStart),
  };
}

export type NewBest = { exerciseName: string; metricType: MetricType; best: number; previous: number };

export type MonthlyReport = {
  month: ReportMonth;
  sessions: number;
  previousMonthSessions: number;
  weekStreak: number;
  totalKg: number;
  newBests: NewBest[];
};

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function selectInChunks<T>(
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

async function loadAttendedDates(supabase: Client, memberId: string): Promise<string[]> {
  const bookings = await fetchAllPages((from, to) =>
    supabase.from("bookings").select("session_id").eq("member_id", memberId).eq("status", "attended").range(from, to)
  );
  const sessions = await selectInChunks(
    bookings.map((b) => b.session_id),
    (chunk) => supabase.from("sessions").select("session_date").in("id", chunk)
  );
  return sessions.map((s) => s.session_date);
}

/** Same exercise -> segment -> session join as the Progress tab. */
async function loadLoggedSets(supabase: Client, memberId: string): Promise<LoggedSet[]> {
  const logs = await fetchAllPages((from, to) =>
    supabase
      .from("exercise_logs")
      .select("exercise_id, weight_kg, reps, time_seconds, distance_m")
      .eq("member_id", memberId)
      .range(from, to)
  );
  const exercises = await selectInChunks([...new Set(logs.map((l) => l.exercise_id))], (chunk) =>
    supabase.from("session_exercises").select("id, name, metric_type, segment_id").in("id", chunk)
  );
  const segments = await selectInChunks([...new Set(exercises.map((e) => e.segment_id))], (chunk) =>
    supabase.from("session_segments").select("id, session_id").in("id", chunk)
  );
  const sessions = await selectInChunks([...new Set(segments.map((s) => s.session_id))], (chunk) =>
    supabase.from("sessions").select("id, session_date").in("id", chunk)
  );

  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  const sessionIdBySegment = new Map(segments.map((s) => [s.id, s.session_id]));
  const dateBySession = new Map(sessions.map((s) => [s.id, s.session_date]));

  const sets: LoggedSet[] = [];
  for (const log of logs) {
    const exercise = exerciseById.get(log.exercise_id);
    if (!exercise) continue;
    const sessionId = sessionIdBySegment.get(exercise.segment_id);
    const sessionDate = sessionId ? dateBySession.get(sessionId) : undefined;
    if (!sessionDate) continue;
    sets.push({
      sessionDate,
      exerciseName: exercise.name,
      metricType: exercise.metric_type,
      weightKg: log.weight_kg,
      reps: log.reps,
      timeSeconds: log.time_seconds,
      distanceM: log.distance_m,
    });
  }
  return sets;
}

/**
 * The number a member thinks of as their "best": heaviest weight for
 * weighted lifts (the Progress tab's weight x reps score isn't a number
 * anyone recognises in an email), otherwise reps / time / distance —
 * max for all, same as computePersonalRecords.
 */
function bestValue(set: LoggedSet): number | null {
  switch (set.metricType) {
    case "weight_kg":
    case "weight_kg_and_reps":
      return set.weightKg;
    case "reps_only":
      return set.reps;
    case "time_seconds":
      return set.timeSeconds;
    case "distance_m":
      return set.distanceM;
  }
}

function bestsByExercise(sets: LoggedSet[]): Map<string, { metricType: MetricType; best: number }> {
  const bests = new Map<string, { metricType: MetricType; best: number }>();
  for (const set of sets) {
    const value = bestValue(set);
    if (!value) continue;
    const existing = bests.get(set.exerciseName);
    if (!existing || value > existing.best) bests.set(set.exerciseName, { metricType: set.metricType, best: value });
  }
  return bests;
}

export async function buildMonthlyReport(supabase: Client, memberId: string, month: ReportMonth): Promise<MonthlyReport> {
  const [attendedDates, sets] = await Promise.all([
    loadAttendedDates(supabase, memberId),
    loadLoggedSets(supabase, memberId),
  ]);

  const inMonth = (date: string) => date >= month.start && date <= month.end;
  const monthSets = sets.filter((s) => inMonth(s.sessionDate));

  // A new best = beat a number they'd already logged before this month.
  // First-time exercises aren't counted — there's nothing to beat yet.
  const before = bestsByExercise(sets.filter((s) => s.sessionDate < month.start));
  const newBests: NewBest[] = [];
  for (const [exerciseName, { metricType, best }] of bestsByExercise(monthSets)) {
    const previous = before.get(exerciseName);
    if (previous && best > previous.best) {
      newBests.push({ exerciseName, metricType, best, previous: previous.best });
    }
  }
  newBests.sort((a, b) => b.best / b.previous - a.best / a.previous);

  return {
    month,
    sessions: attendedDates.filter(inMonth).length,
    previousMonthSessions: attendedDates.filter((d) => d >= month.previousStart && d < month.start).length,
    weekStreak: computeWeekStreak(attendedDates),
    totalKg: Math.round(monthSets.reduce((sum, s) => sum + loggedKg(s), 0)),
    newBests,
  };
}

const UNIT: Record<MetricType, string> = {
  weight_kg: "kg",
  weight_kg_and_reps: "kg",
  reps_only: "reps",
  time_seconds: "sec",
  distance_m: "m",
};

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function formatValue(value: number, metricType: MetricType) {
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${UNIT[metricType]}`;
}

function statTile(value: string, label: string, note?: string) {
  return `<td style="width:33%;padding:12px 8px;background:#f3f5f7;border-radius:8px;text-align:center;vertical-align:top">
      <div style="font-size:24px;font-weight:700;color:#111">${value}</div>
      <div style="font-size:12px;color:#666;margin-top:2px">${label}</div>
      ${note ? `<div style="font-size:11px;color:#2e9bf0;margin-top:4px">${note}</div>` : ""}
    </td>`;
}

export function monthlyReportSubject(report: MonthlyReport) {
  return `Your ${report.month.label} at Fitness Blueprint`;
}

export function monthlyReportHtml(fullName: string, report: MonthlyReport, progressUrl: string) {
  const firstName = escapeHtml(fullName.split(" ")[0] ?? fullName);
  const { month, sessions, previousMonthSessions, weekStreak, totalKg, newBests } = report;

  const sessionNote =
    previousMonthSessions === 0
      ? undefined
      : sessions > previousMonthSessions
        ? `${sessions - previousMonthSessions} more than ${month.previousLabel}`
        : sessions === previousMonthSessions
          ? `same as ${month.previousLabel}`
          : undefined;

  const tiles = [
    statTile(String(sessions), sessions === 1 ? "session" : "sessions", sessionNote),
    statTile(String(weekStreak), weekStreak === 1 ? "week streak" : "weeks in a row"),
    totalKg > 0 ? statTile(`${totalKg.toLocaleString("en-GB")}`, "kg lifted") : "",
  ]
    .filter(Boolean)
    .join('<td style="width:8px"></td>');

  const bests = newBests.slice(0, 5);
  const bestsHtml = bests.length
    ? `<p style="font-size:16px;font-weight:600;margin:28px 0 8px">New bests 🏆</p>
  <ul style="font-size:15px;line-height:1.7;padding-left:20px;margin:0">
    ${bests
      .map(
        (b) =>
          `<li>${escapeHtml(b.exerciseName)}: <strong>${formatValue(b.best, b.metricType)}</strong> <span style="color:#666">(up from ${formatValue(b.previous, b.metricType)})</span></li>`
      )
      .join("\n    ")}
  </ul>`
    : "";

  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <h1 style="font-size:22px;margin:0 0 8px">Your ${month.label}, ${firstName}</h1>
  <p style="font-size:16px;line-height:1.5;margin:0 0 20px">Here's what you put in last month. Every session counts — nice work.</p>
  <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:0"><tr>${tiles}</tr></table>
  ${bestsHtml}
  <p style="margin:28px 0">
    <a href="${progressUrl}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">See your progress</a>
  </p>
  <p style="font-size:13px;color:#666;margin-top:28px">Fitness Blueprint</p>
</div>`.trim();
}
