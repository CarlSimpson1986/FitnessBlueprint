/**
 * Weekly check-in timing (weekly_checkins, 0028). A check-in belongs to a
 * Sunday. It opens that Sunday and stays open through Wednesday, so a
 * member who misses Sunday still gets prompted Mon–Wed; Thursday–Saturday
 * there's nothing open. All in UK time — the gym's calendar, not the
 * server's (Vercel runs in UTC).
 */

function londonDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { dateKey: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday") };
}

function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DAYS_SINCE_SUNDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3 };

/** The Sunday whose check-in is open right now, or null (Thu–Sat). */
export function openCheckinWeek(now: Date = new Date()): string | null {
  const { dateKey, weekday } = londonDateParts(now);
  const offset = DAYS_SINCE_SUNDAY[weekday];
  return offset === undefined ? null : addDaysKey(dateKey, -offset);
}

export const RATING_LABELS: Record<"energy" | "sleep" | "nutrition", [string, string]> = {
  energy: ["Drained", "Buzzing"],
  sleep: ["Awful", "Great"],
  nutrition: ["Off track", "Nailed it"],
};

/** The most recent Sunday (today, if it's Sunday) — the default week to review. */
export function latestCheckinWeek(now: Date = new Date()): string {
  const { dateKey, weekday } = londonDateParts(now);
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return addDaysKey(dateKey, -Math.max(0, order.indexOf(weekday)));
}

export function shiftWeek(weekOf: string, weeks: number) {
  return addDaysKey(weekOf, weeks * 7);
}
