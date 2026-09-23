"use server";

import { requireCoachOrOwner } from "@/lib/auth";

export type ActionResult = { error?: string };

export type Feeling = "great" | "okay" | "rough";
export type SleepQuality = "good" | "average" | "poor";

export type RosterEntry = {
  bookingId: string;
  memberName: string;
  status: "booked" | "cancelled" | "attended" | "no_show" | "excused" | "invited";
  readiness: {
    feeling: Feeling;
    sleepQuality: SleepQuality | null;
    painArea: string | null;
  } | null;
};

/**
 * Roster is read via the RLS-respecting client — "coaches and owner read
 * all bookings", "coaches and owner read all profiles", and "coaches and
 * owner read all checkins" (0002) already cover this, so there's nothing
 * to bypass here.
 */
export async function getSessionRoster(sessionId: string): Promise<{ roster?: RosterEntry[]; error?: string }> {
  const { supabase } = await requireCoachOrOwner();

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
  const { data: members, error: membersError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", memberIds.length > 0 ? memberIds : [""]);

  if (membersError) {
    return { error: membersError.message };
  }

  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const checkinByMember = new Map((checkins ?? []).map((c) => [c.member_id, c]));

  const roster = (bookings ?? []).map((booking) => {
    const checkin = checkinByMember.get(booking.member_id);
    return {
      bookingId: booking.id,
      memberName: nameById.get(booking.member_id) ?? "Unknown member",
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
  const { supabase } = await requireCoachOrOwner();

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
