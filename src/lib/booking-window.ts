/**
 * How far ahead members can book, in days (UK dates): on a Tuesday, up to
 * next Tuesday. Enforced by book_session() (latest:
 * supabase/migrations/0059_weekly_allowance_counts_late_cancels.sql) —
 * change both together.
 */
export const BOOKING_WINDOW_DAYS = 7;

/** The last UK date a member can book today, as YYYY-MM-DD. */
export function lastBookableDate(todayKey: string): string {
  const d = new Date(`${todayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + BOOKING_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

/** Cancelling inside this long before the start forfeits the class (cancel_booking 0012/0054, book_session 0059). */
export const LATE_CANCEL_MS = 3 * 60 * 60 * 1000;

/**
 * A session's start as epoch ms. session_date/start_time are UK wall-clock
 * ("2026-10-05", "18:30:00"), so the UK/UTC offset at that moment (0 in
 * GMT, 1 hour in BST) is taken off.
 */
export function ukSessionStart(date: string, time: string): number {
  const asUtc = new Date(`${date}T${time.slice(0, 8)}Z`);
  const ukHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(asUtc)
  );
  const offsetHours = (ukHour - asUtc.getUTCHours() + 24) % 24;
  return asUtc.getTime() - offsetHours * 60 * 60 * 1000;
}
