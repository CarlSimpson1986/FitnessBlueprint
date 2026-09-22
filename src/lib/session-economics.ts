import "server-only";
import { createClient } from "@/lib/supabase/server";
import { toLocalDateKey } from "@/lib/format";

// Spots that occupy a capacity slot and weren't cancelled — same set the
// buddy-booking "X/Y booked" display counts (see 0014's invited status).
const OCCUPIED_STATUSES = new Set(["booked", "attended", "no_show", "excused", "invited"]);
const MARKED_STATUSES = new Set(["attended", "no_show", "excused"]);

export type CoachEconomics = {
  coachId: string;
  coachName: string;
  sessionCount: number;
  totalCapacity: number;
  totalFilled: number;
  fillRate: number;
  attendanceMarked: number;
  noShowCount: number;
  noShowRate: number | null;
};

export type WorstFillRow = {
  sessionId: string;
  sessionDate: string;
  startTime: string;
  templateName: string;
  coachName: string;
  capacity: number;
  filled: number;
  fillRate: number;
};

export type SessionEconomicsResult = {
  byCoach: CoachEconomics[];
  overall: {
    sessionCount: number;
    totalCapacity: number;
    totalFilled: number;
    fillRate: number;
    attendanceMarked: number;
    attendedCount: number;
    noShowCount: number;
    excusedCount: number;
    noShowRate: number | null;
  };
  unmarkedSessionCount: number;
  worstFill: WorstFillRow[];
};

/**
 * Fill rate and no-show rate per coach, computed read-time from
 * sessions/bookings the same way the challenge tracker and attendance
 * streak are — no stored counters. Only sessions that have already
 * happened (session_date in the past, not coach-cancelled) count, since
 * a scheduled-but-not-yet-run session has no attendance signal yet.
 */
export async function fetchSessionEconomics(
  startDate: Date,
  endDate: Date
): Promise<SessionEconomicsResult> {
  const supabase = await createClient();
  const today = toLocalDateKey(new Date());
  const rangeEnd = toLocalDateKey(endDate);
  const effectiveEnd = rangeEnd < today ? rangeEnd : today;

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, start_time, capacity, coach_id, template_id, status")
    .neq("status", "cancelled")
    .gte("session_date", toLocalDateKey(startDate))
    .lt("session_date", effectiveEnd);

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((s) => s.id);

  if (sessionIds.length === 0) {
    return {
      byCoach: [],
      overall: {
        sessionCount: 0,
        totalCapacity: 0,
        totalFilled: 0,
        fillRate: 0,
        attendanceMarked: 0,
        attendedCount: 0,
        noShowCount: 0,
        excusedCount: 0,
        noShowRate: null,
      },
      unmarkedSessionCount: 0,
      worstFill: [],
    };
  }

  const coachIds = [...new Set(sessionRows.map((s) => s.coach_id))];
  const templateIds = [...new Set(sessionRows.map((s) => s.template_id))];

  const [{ data: bookings }, { data: coaches }, { data: templates }] = await Promise.all([
    supabase.from("bookings").select("session_id, status").in("session_id", sessionIds),
    supabase.from("profiles").select("id, full_name").in("id", coachIds),
    supabase.from("session_templates").select("id, name").in("id", templateIds),
  ]);

  const coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));

  const bookingsBySession = new Map<string, { status: string }[]>();
  for (const b of bookings ?? []) {
    const list = bookingsBySession.get(b.session_id) ?? [];
    list.push(b);
    bookingsBySession.set(b.session_id, list);
  }

  type Accum = {
    coachName: string;
    sessionCount: number;
    totalCapacity: number;
    totalFilled: number;
    attendanceMarked: number;
    noShowCount: number;
  };
  const byCoachAccum = new Map<string, Accum>();
  const worstFill: WorstFillRow[] = [];

  let unmarkedSessionCount = 0;
  let overallCapacity = 0;
  let overallFilled = 0;
  let overallMarked = 0;
  let overallAttended = 0;
  let overallNoShow = 0;
  let overallExcused = 0;

  for (const session of sessionRows) {
    const sessionBookings = bookingsBySession.get(session.id) ?? [];
    const filled = sessionBookings.filter((b) => OCCUPIED_STATUSES.has(b.status)).length;
    const marked = sessionBookings.filter((b) => MARKED_STATUSES.has(b.status)).length;
    const attended = sessionBookings.filter((b) => b.status === "attended").length;
    const noShow = sessionBookings.filter((b) => b.status === "no_show").length;
    const excused = sessionBookings.filter((b) => b.status === "excused").length;

    if (marked === 0 && filled > 0) unmarkedSessionCount += 1;

    overallCapacity += session.capacity;
    overallFilled += filled;
    overallMarked += marked;
    overallAttended += attended;
    overallNoShow += noShow;
    overallExcused += excused;

    const coachName = coachNameById.get(session.coach_id) ?? "Unknown coach";
    const accum = byCoachAccum.get(session.coach_id) ?? {
      coachName,
      sessionCount: 0,
      totalCapacity: 0,
      totalFilled: 0,
      attendanceMarked: 0,
      noShowCount: 0,
    };
    accum.sessionCount += 1;
    accum.totalCapacity += session.capacity;
    accum.totalFilled += filled;
    accum.attendanceMarked += marked;
    accum.noShowCount += noShow;
    byCoachAccum.set(session.coach_id, accum);

    worstFill.push({
      sessionId: session.id,
      sessionDate: session.session_date,
      startTime: session.start_time,
      templateName: templateNameById.get(session.template_id) ?? "Session",
      coachName,
      capacity: session.capacity,
      filled,
      fillRate: session.capacity > 0 ? filled / session.capacity : 0,
    });
  }

  const byCoach: CoachEconomics[] = [...byCoachAccum.entries()].map(([coachId, a]) => ({
    coachId,
    coachName: a.coachName,
    sessionCount: a.sessionCount,
    totalCapacity: a.totalCapacity,
    totalFilled: a.totalFilled,
    fillRate: a.totalCapacity > 0 ? a.totalFilled / a.totalCapacity : 0,
    attendanceMarked: a.attendanceMarked,
    noShowCount: a.noShowCount,
    noShowRate: a.attendanceMarked > 0 ? a.noShowCount / a.attendanceMarked : null,
  }));
  byCoach.sort((a, b) => b.sessionCount - a.sessionCount);

  worstFill.sort((a, b) => a.fillRate - b.fillRate);

  return {
    byCoach,
    overall: {
      sessionCount: sessionRows.length,
      totalCapacity: overallCapacity,
      totalFilled: overallFilled,
      fillRate: overallCapacity > 0 ? overallFilled / overallCapacity : 0,
      attendanceMarked: overallMarked,
      attendedCount: overallAttended,
      noShowCount: overallNoShow,
      excusedCount: overallExcused,
      noShowRate: overallMarked > 0 ? overallNoShow / overallMarked : null,
    },
    unmarkedSessionCount,
    worstFill: worstFill.slice(0, 10),
  };
}
