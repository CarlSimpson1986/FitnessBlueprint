import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type TimeOff = { id: string; coach_id: string; starts_on: string; ends_on: string; note: string | null };

/**
 * Coach time off (coach_time_off, 0032) overlapping [fromKey, toKey], both
 * inclusive UK dates. Read on the caller's RLS client: the owner sees
 * everyone's, a coach only their own. Returns [] if the lookup fails, so
 * a missing table can never take the dashboard or calendar down.
 */
export async function fetchTimeOff(supabase: Supabase, fromKey: string, toKey: string): Promise<TimeOff[]> {
  const { data, error } = await supabase
    .from("coach_time_off")
    .select("id, coach_id, starts_on, ends_on, note")
    .lte("starts_on", toKey)
    .gte("ends_on", fromKey)
    .order("starts_on");
  if (error) {
    console.error("fetchTimeOff failed:", error.message);
    return [];
  }
  return data ?? [];
}

/** Is `coachId` off on `dateKey`? */
export function isOff(timeOff: TimeOff[], coachId: string, dateKey: string) {
  return timeOff.some((t) => t.coach_id === coachId && t.starts_on <= dateKey && t.ends_on >= dateKey);
}

/** "Mon 6 Oct", or "Mon 6 – Fri 10 Oct" for a range. */
export function formatRange(startsOn: string, endsOn: string) {
  const fmt = (key: string, withMonth: boolean) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: "UTC",
    });
  if (startsOn === endsOn) return fmt(startsOn, true);
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
  return `${fmt(startsOn, !sameMonth)} – ${fmt(endsOn, true)}`;
}

/**
 * Which classes (session_templates) each coach teaches, derived from the
 * sessions they're scheduled on — the last 8 weeks plus anything upcoming
 * — rather than a separate list to keep up to date.
 */
export async function fetchClassesByCoach(supabase: Supabase): Promise<Map<string, Set<string>>> {
  const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("sessions")
    .select("coach_id, template_id")
    .neq("status", "cancelled")
    .gte("session_date", since);
  const byCoach = new Map<string, Set<string>>();
  for (const s of data ?? []) {
    const set = byCoach.get(s.coach_id) ?? new Set<string>();
    set.add(s.template_id);
    byCoach.set(s.coach_id, set);
  }
  return byCoach;
}
