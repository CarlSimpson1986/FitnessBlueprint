"use server";

import { requireStaffAccess } from "@/lib/coach-permissions";
import { SESSION_NOTE_MAX_LENGTH, SESSION_NOTE_TAGS, type SessionNote } from "@/lib/session-notes";

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
  memberId: string;
  memberName: string;
  programme: ProgrammeTag | null;
  status: "booked" | "cancelled" | "attended" | "no_show" | "excused" | "invited";
  readiness: {
    feeling: Feeling;
    sleepQuality: SleepQuality | null;
    painArea: string | null;
  } | null;
  /**
   * Coach notes (0047). canNote false = this member hasn't said yes to
   * health info, or the viewer's Check-ins switch is off — RLS returns no
   * notes either way, so nothing to show or write.
   */
  canNote: boolean;
  note: SessionNote | null;
  /** Most recent note from an earlier session ("last time"). */
  lastNote: SessionNote | null;
};

/** A friend a member brought (0050) — not a member, so no attendance or notes. */
export type RosterGuest = {
  inviteId: string;
  name: string;
  invitedBy: string;
  confirmed: boolean;
  /** null = not confirmed yet, or the viewer's Check-ins switch is off (guest_details RLS). */
  health: { phone: string; anyYes: boolean; notes: string | null } | null;
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
 * book_session() uses for the programme's last day (0030). Notes come
 * from "session_notes: read" (0047): Check-ins switch + health consent.
 */
const NO_TODAY_ACCESS = "Guy has turned off Today for your account.";

export async function getSessionRoster(
  sessionId: string
): Promise<{ roster?: RosterEntry[]; guests?: RosterGuest[]; error?: string }> {
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
      supabase.from("profiles").select("id, full_name, health_consent").in("id", idFilter),
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

  // This session's notes, plus recent ones for the "last time" line.
  const { data: notes } = await supabase
    .from("session_notes")
    .select("session_id, member_id, tags, note_text, created_at")
    .in("member_id", idFilter)
    .order("created_at", { ascending: false })
    .limit(200);
  const otherSessionIds = [...new Set((notes ?? []).map((n) => n.session_id).filter((id) => id !== sessionId))];
  const { data: noteSessions } = await supabase
    .from("sessions")
    .select("id, session_date")
    .in("id", otherSessionIds.length > 0 ? otherSessionIds : [""]);
  const dateBySession = new Map((noteSessions ?? []).map((s) => [s.id, s.session_date]));

  const noteByMember = new Map<string, SessionNote>();
  const lastNoteByMember = new Map<string, SessionNote>();
  for (const n of notes ?? []) {
    if (n.session_id === sessionId) {
      noteByMember.set(n.member_id, { tags: n.tags, text: n.note_text });
      continue;
    }
    const sessionDate = dateBySession.get(n.session_id);
    if (!sessionDate || !session || sessionDate >= session.session_date) continue;
    const current = lastNoteByMember.get(n.member_id);
    if (!current || (current.sessionDate ?? "") < sessionDate) {
      lastNoteByMember.set(n.member_id, {
        tags: n.tags,
        text: n.note_text,
        sessionDate,
      });
    }
  }

  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const consentById = new Map((members ?? []).map((m) => [m.id, m.health_consent === true]));
  const checkinByMember = new Map((checkins ?? []).map((c) => [c.member_id, c]));

  const roster = (bookings ?? []).map((booking) => {
    const checkin = checkinByMember.get(booking.member_id);
    return {
      bookingId: booking.id,
      memberId: booking.member_id,
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
      canNote: access.checkins && (consentById.get(booking.member_id) ?? false),
      note: noteByMember.get(booking.member_id) ?? null,
      lastNote: lastNoteByMember.get(booking.member_id) ?? null,
    };
  });

  return { roster, guests: await loadGuests(supabase, sessionId, nameById) };
}

/**
 * Guests on this class: "guest_invites: read" (0050, Today switch) for who's
 * coming, "guest_details: read" (Check-ins switch) for phone + health.
 */
async function loadGuests(
  supabase: Awaited<ReturnType<typeof requireStaffAccess>>["supabase"],
  sessionId: string,
  nameById: Map<string, string>
): Promise<RosterGuest[]> {
  const { data: invites } = await supabase
    .from("guest_invites")
    .select("id, guest_name, invited_by, status")
    .eq("session_id", sessionId)
    .in("status", ["invited", "confirmed"])
    .order("created_at");
  if (!invites?.length) return [];

  const { data: details } = await supabase
    .from("guest_details")
    .select("invite_id, phone, health_any_yes, health_notes")
    .in("invite_id", invites.map((i) => i.id));
  const detailsById = new Map((details ?? []).map((d) => [d.invite_id, d]));

  const missing = invites.map((i) => i.invited_by).filter((id) => !nameById.has(id));
  if (missing.length) {
    const { data: inviters } = await supabase.from("profiles").select("id, full_name").in("id", missing);
    for (const p of inviters ?? []) nameById.set(p.id, p.full_name);
  }

  return invites.map((i) => {
    const d = detailsById.get(i.id);
    return {
      inviteId: i.id,
      name: i.guest_name,
      invitedBy: nameById.get(i.invited_by) ?? "a member",
      confirmed: i.status === "confirmed",
      health: d ? { phone: d.phone, anyYes: d.health_any_yes, notes: d.health_notes } : null,
    };
  });
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

/**
 * Saves (or clears) the coach's note on one member for one session.
 * RLS (0047, "session_notes: create/change/delete" via
 * can_write_session_note) is the gate: the owner, or the coach taking
 * this session with Today on; Check-ins on; member booked and has said
 * yes to health info. Anyone else writes 0 rows / gets an RLS error.
 */
export async function saveSessionNote(
  sessionId: string,
  memberId: string,
  tags: string[],
  text: string,
): Promise<ActionResult> {
  const { supabase, profile, access } = await requireStaffAccess();
  if (!access.today) return { error: NO_TODAY_ACCESS };

  const cleanTags = [...new Set(tags)].filter((t) => (SESSION_NOTE_TAGS as readonly string[]).includes(t));
  const cleanText = text.trim();
  if (cleanText.length > SESSION_NOTE_MAX_LENGTH) {
    return {
      error: `Keep the note under ${SESSION_NOTE_MAX_LENGTH} characters.`,
    };
  }

  if (cleanTags.length === 0 && !cleanText) {
    const { error } = await supabase
      .from("session_notes")
      .delete()
      .eq("session_id", sessionId)
      .eq("member_id", memberId);
    return error ? { error: error.message } : {};
  }

  const { data, error } = await supabase
    .from("session_notes")
    .upsert(
      {
        session_id: sessionId,
        member_id: memberId,
        coach_id: profile.id,
        tags: cleanTags,
        note_text: cleanText || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,member_id" },
    )
    .select("id");

  if (error) {
    return {
      error: error.code === "42501" ? "You can't add notes for this member on this session." : error.message,
    };
  }
  if (!data || data.length === 0) {
    return { error: "You can't add notes for this member on this session." };
  }
  return {};
}
