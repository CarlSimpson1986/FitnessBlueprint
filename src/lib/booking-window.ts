/**
 * How far ahead members can book, in days (UK dates). Enforced by
 * book_session() in supabase/migrations/0031_two_week_booking_window.sql —
 * change both together.
 */
export const BOOKING_WINDOW_DAYS = 14;

/** The last UK date a member can book today, as YYYY-MM-DD. */
export function lastBookableDate(todayKey: string): string {
  const d = new Date(`${todayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + BOOKING_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}
