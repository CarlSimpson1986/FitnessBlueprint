import { toLocalDateKey } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const dayOfWeek = d.getDay(); // 0 = Sunday
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKey(date: Date): string {
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
