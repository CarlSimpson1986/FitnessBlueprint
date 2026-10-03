"use server";

import { requireStaffAccess } from "@/lib/coach-permissions";

export type ActionResult = { error?: string };

export type Feeling = "great" | "okay" | "rough";
export type SleepQuality = "good" | "average" | "poor";

/** A fixed-length programme the member is on (6-week, 21-day starter…). */
export type ProgrammeTag = {
  label: string;
  /** Day of the programme this session falls on, 1-based. */
  day: number;
  lengthDays: number;
};

export type RosterEntry = {
  bookingId: string;
  memberName: string;
  programme: ProgrammeTag | null;
  status: "booked" | "cancelled" | "attended" | "no_show" | "excused" | "invited";
  readiness: {
    feeling: Feeling;
    sleepQuality: SleepQuality | null;
    painArea: string | null;
  } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

function programmeLabel(lengthDays: number) {
  return lengthDays === 42 ? "6-week" : `${lengthDays}-day`;
}

/**
 * Roster is read via the RLS-respecting client — "coaches and owner read
 * all bookings", "coaches and owner read all profiles", and "coaches and
 * owner read all checkins" (0002, per-coach switches since 0042) cover this, so there's nothing
 * to bypass here. Programme tags come from "coaches and owner read all
 * memberships" and "authenticated users read plans" (0002): any active
 * membership on a plan with programme_length_days set — the same test
 * book_session() uses for the programme's last day (0030).
 */
const NO_TODAY_ACCESS = "Guy has turned off Today for your account.";

export async function getSessionRoster(sessionId: string): Promise<{ roster?: RosterEntry[]; error?: string }> {
  // Called from a client component, so return an error rather than redirect.
  const { supabase, access } = await requireStaffAccess();
  if (!access.today) return { error: NO_TODAY_ACCESS };

  const [{ data: bookings, error }, { data: checkins }] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, member_id, status")
      .eq("session_id", sessionId)
      .order("booked_at"),
    supabase
      .from("readiness_checkins")
      .select("member_id, feeling, sleep_quality, pain_area")
      .eq("session_id", sessionId),
  ]);

  if (error) {
    return { error: error.message };
  }

  const memberIds = (bookings ?? []).map((b) => b.member_id);
  const idFilter = memberIds.length > 0 ? memberIds : [""];
  const [{ data: members, error: membersError }, { data: session }, { data: memberships }, { data: programmePlans }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", idFilter),
      supabase.from("sessions").select("session_date").eq("id", sessionId).maybeSingle(),
      supabase.from("member_memberships").select("member_id, plan_id, started_at").eq("status", "active").in("member_id", idFilter),
      supabase.from("membership_plans").select("id, programme_length_days").not("programme_length_days", "is", null),
    ]);

  if (membersError) {
    return { error: membersError.message };
  }

  const lengthByPlan = new Map((programmePlans ?? []).map((p) => [p.id, p.programme_length_days ?? 0]));
  const programmeByMember = new Map<string, ProgrammeTag>();
  for (const m of memberships ?? []) {
    const lengthDays = lengthByPlan.get(m.plan_id);
    if (!lengthDays || !session) continue;
    const startKey = ukDateKey(new Date(m.started_at));
    const day = Math.round((Date.parse(session.session_date) - Date.parse(startKey)) / DAY_MS) + 1;
    programmeByMember.set(m.member_id, { label: programmeLabel(lengthDays), day, lengthDays });
  }

  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const checkinByMember = new Map((checkins ?? []).map((c) => [c.member_id, c]));

  const roster = (bookings ?? []).map((booking) => {
    const checkin = checkinByMember.get(booking.member_id);
    return {
      bookingId: booking.id,
      memberName: nameById.get(booking.member_id) ?? "Unknown member",
      programme: programmeByMember.get(booking.member_id) ?? null,
      status: booking.status,
      readiness: checkin
        ? {
            feeling: checkin.feeling as Feeling,
            sleepQuality: checkin.sleep_quality as SleepQuality | null,
            painArea: checkin.pain_area,
          }
        : null,
    };
  });

  return { roster };
}

const MARKABLE_STATUSES = ["attended", "no_show", "excused"] as const;
type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

/**
 * Marking attendance updates a single booking. RLS (0024) is what limits
 * this: "coaches mark attendance on their own sessions" / "owner updates
 * any booking" — a coach marking someone else's class updates 0 rows and
 * gets the "no longer booked" error below. No admin client.
 */
export async function markAttendance(bookingId: string, status: MarkableStatus): Promise<ActionResult> {
  // Called from a client component, so return an error rather than redirect.
  const { supabase, access } = await requireStaffAccess();
  if (!access.today) return { error: NO_TODAY_ACCESS };

  if (!MARKABLE_STATUSES.includes(status)) {
    return { error: "Invalid attendance status." };
  }

  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("status", "booked")
    .select("id");

  if (error) {
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    return { error: "This booking is no longer marked as booked — refresh and try again." };
  }

  return {};
}
