import { toLocalDateKey } from "@/lib/format";
import type { MetricType } from "@/lib/workout-content";

const DAY_MS = 24 * 60 * 60 * 1000;

// Exported for src/app/api/cron/reminders/route.ts — same Monday-start ISO
// week bucketing used for the attendance streak, reused there for the
// Sunday check-in reminder and quiet-member alert so both use one
// definition of "week".
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sunday
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekKey(date: Date): string {
  return toLocalDateKey(mondayOf(date));
}

/**
 * Consecutive weeks with at least one attended session, counting back from
 * the current week (or the previous week, so the streak doesn't drop to
 * zero just because a member hasn't trained yet this week). A gap of a
 * full week with no attendance breaks the streak — this fits a
 * 1-3x/week group-class schedule better than a daily-attendance streak
 * would.
 */
export function computeWeekStreak(attendedDates: string[]): number {
  const attendedWeeks = new Set(
    attendedDates.map((dateStr) => weekKey(new Date(`${dateStr}T00:00:00`)))
  );

  const now = new Date();
  const currentWeek = weekKey(now);
  const previousWeek = weekKey(new Date(now.getTime() - 7 * DAY_MS));

  let cursor: Date;
  if (attendedWeeks.has(currentWeek)) {
    cursor = mondayOf(now);
  } else if (attendedWeeks.has(previousWeek)) {
    cursor = mondayOf(new Date(now.getTime() - 7 * DAY_MS));
  } else {
    return 0;
  }

  let streak = 0;
  while (attendedWeeks.has(toLocalDateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 7 * DAY_MS);
  }

  return streak;
}

export type LoggedSet = {
  sessionDate: string;
  exerciseName: string;
  metricType: MetricType;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
  distanceM: number | null;
};

/**
 * A logged set's contribution to "total weight lifted" — same convention as
 * the Finish screen's per-session stat (src/app/(member)/sessions/
 * [sessionId]/finish/page.tsx), just aggregated across every session
 * instead of one. weight_kg contributes as-is; weight_kg_and_reps
 * contributes weight x reps; every other metric contributes 0 (reps/time/
 * distance aren't weight).
 */
function loggedKg(entry: Pick<LoggedSet, "metricType" | "weightKg" | "reps">): number {
  if (entry.metricType === "weight_kg" && entry.weightKg) return entry.weightKg;
  if (entry.metricType === "weight_kg_and_reps" && entry.weightKg && entry.reps) {
    return entry.weightKg * entry.reps;
  }
  return 0;
}

/**
 * Total kg lifted per week, oldest to newest, zero-filled for weeks with no
 * logged sets — computed at read time from exercise_logs, no stored
 * counter, same convention as computeWeekStreak above.
 */
export function computeWeeklyTotalLifted(entries: LoggedSet[], weeks = 6): { weekStart: string; totalKg: number }[] {
  const totalsByWeek = new Map<string, number>();
  for (const entry of entries) {
    const key = weekKey(new Date(`${entry.sessionDate}T00:00:00`));
    totalsByWeek.set(key, (totalsByWeek.get(key) ?? 0) + loggedKg(entry));
  }

  const thisWeekMonday = mondayOf(new Date());
  const result: { weekStart: string; totalKg: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = new Date(thisWeekMonday.getTime() - i * 7 * DAY_MS);
    const key = toLocalDateKey(monday);
    result.push({ weekStart: key, totalKg: totalsByWeek.get(key) ?? 0 });
  }
  return result;
}

export type PersonalRecord = { exerciseName: string; metricType: MetricType; best: number };

/**
 * Best-ever value per exercise name (not per session_exercise row — the
 * same movement recurs across many sessions under the same name).
 * "Best" is the max logged value for every metric type, including
 * time_seconds — this repo has no exercise-level "lower is better" flag
 * (e.g. a sprint time vs. a held plank), so max is the simple, honest
 * default rather than guessing per exercise.
 */
export function computePersonalRecords(entries: LoggedSet[]): PersonalRecord[] {
  const bestByName = new Map<string, PersonalRecord>();

  for (const entry of entries) {
    let value: number | null;
    switch (entry.metricType) {
      case "weight_kg":
        value = entry.weightKg;
        break;
      case "weight_kg_and_reps":
        value = entry.weightKg && entry.reps ? entry.weightKg * entry.reps : null;
        break;
      case "reps_only":
        value = entry.reps;
        break;
      case "time_seconds":
        value = entry.timeSeconds;
        break;
      case "distance_m":
        value = entry.distanceM;
        break;
    }
    if (value === null) continue;

    const existing = bestByName.get(entry.exerciseName);
    if (!existing || value > existing.best) {
      bestByName.set(entry.exerciseName, { exerciseName: entry.exerciseName, metricType: entry.metricType, best: value });
    }
  }

  return Array.from(bestByName.values()).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName));
}

/**
 * Last `days` days (oldest to newest, including today), each with how many
 * distinct habits were logged that day — a simple contribution-grid style
 * view, computed at read time from habit_logs.
 */
export function computeHabitStreakGrid(habitLogDates: string[], days = 14): { date: string; count: number }[] {
  const countByDate = new Map<string, number>();
  for (const date of habitLogDates) {
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const key = toLocalDateKey(date);
    result.push({ date: key, count: countByDate.get(key) ?? 0 });
  }
  return result;
}
