import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DAYS = 30;
const FUTURE_DAYS = 120;

/**
 * iCalendar (.ics) subscription feeds, served by /api/calendar/[token]:
 * - a member (or coach) gets their own bookings,
 * - the owner gets every scheduled session plus coach time off.
 * Times are sent in UTC ("Z"), converted from the gym's UK wall-clock
 * session times, so every calendar app shows them right across the clock
 * changes without needing a VTIMEZONE block.
 */

/** UK wall-clock date + time -> UTC Date. */
function londonToUtc(dateKey: string, time: string): Date {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi!));
  // What London's clock reads at that UTC instant tells us the offset.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const lh = Number(parts.find((p) => p.type === "hour")?.value);
  const lm = Number(parts.find((p) => p.type === "minute")?.value);
  let offsetMin = lh * 60 + lm - (h! * 60 + mi!);
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;
  return new Date(guess.getTime() - offsetMin * 60 * 1000);
}

const icsTime = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (dateKey: string) => dateKey.replace(/-/g, "");
const nextDay = (dateKey: string) => new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
const escapeText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds lines to 75 octets as the spec asks (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  url?: string;
  start: { utc: Date } | { date: string };
  end: { utc: Date } | { date: string };
};

function buildCalendar(name: string, events: IcsEvent[]): string {
  const stamp = icsTime(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fitness Blueprint//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Europe/London",
    // A hint to apps that honour it (Apple, Outlook); Google refreshes on its own schedule.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    lines.push("utc" in e.start ? `DTSTART:${icsTime(e.start.utc)}` : `DTSTART;VALUE=DATE:${icsDate(e.start.date)}`);
    lines.push("utc" in e.end ? `DTEND:${icsTime(e.end.utc)}` : `DTEND;VALUE=DATE:${icsDate(e.end.date)}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function windowKeys() {
  const now = Date.now();
  return {
    from: new Date(now - PAST_DAYS * DAY_MS).toISOString().slice(0, 10),
    to: new Date(now + FUTURE_DAYS * DAY_MS).toISOString().slice(0, 10),
  };
}

type SessionRow = { id: string; session_date: string; start_time: string; duration_minutes: number | null; template_id: string; coach_id: string };

async function namesFor(admin: Admin, sessions: SessionRow[]) {
  const [{ data: classes }, { data: coaches }] = await Promise.all([
    admin.from("session_templates").select("id, name").in("id", [...new Set(sessions.map((s) => s.template_id))]),
    admin.from("profiles").select("id, full_name").in("id", [...new Set(sessions.map((s) => s.coach_id))]),
  ]);
  return {
    className: new Map((classes ?? []).map((c) => [c.id, c.name])),
    coachName: new Map((coaches ?? []).map((c) => [c.id, c.full_name])),
  };
}

function sessionTimes(s: SessionRow) {
  const start = londonToUtc(s.session_date, s.start_time.slice(0, 5));
  return { start: { utc: start }, end: { utc: new Date(start.getTime() + (s.duration_minutes ?? 60) * 60 * 1000) } };
}

/** A member's (or coach's) own bookings. */
export async function memberFeed(admin: Admin, profileId: string, siteUrl: string): Promise<string> {
  const { from, to } = windowKeys();
  const { data: bookings } = await admin
    .from("bookings")
    .select("session_id")
    .eq("member_id", profileId)
    .in("status", ["booked", "attended"]);
  const ids = (bookings ?? []).map((b) => b.session_id);
  const { data: sessions } = ids.length
    ? await admin
        .from("sessions")
        .select("id, session_date, start_time, duration_minutes, template_id, coach_id")
        .in("id", ids)
        .neq("status", "cancelled")
        .gte("session_date", from)
        .lte("session_date", to)
    : { data: [] };
  const rows = (sessions ?? []) as SessionRow[];
  const { className, coachName } = await namesFor(admin, rows);

  return buildCalendar(
    "Fitness Blueprint — my sessions",
    rows.map((s) => ({
      uid: `booking-${s.id}-${profileId}@fitnessblueprint`,
      summary: `${className.get(s.template_id) ?? "Session"} · Fitness Blueprint`,
      description: `Coach: ${coachName.get(s.coach_id) ?? "TBC"}\nManage your booking in the app.`,
      url: `${siteUrl}/sessions`,
      ...sessionTimes(s),
    }))
  );
}

/** The owner's whole-gym view: every scheduled session plus coach time off. */
export async function ownerFeed(admin: Admin, siteUrl: string): Promise<string> {
  const { from, to } = windowKeys();
  const [{ data: sessions }, { data: timeOff }] = await Promise.all([
    admin
      .from("sessions")
      .select("id, session_date, start_time, duration_minutes, template_id, coach_id")
      .eq("status", "scheduled")
      .gte("session_date", from)
      .lte("session_date", to),
    admin.from("coach_time_off").select("id, coach_id, starts_on, ends_on, note").gte("ends_on", from).lte("starts_on", to),
  ]);
  const rows = (sessions ?? []) as SessionRow[];
  const { data: bookings } = rows.length
    ? await admin.from("bookings").select("session_id").in("session_id", rows.map((s) => s.id)).in("status", ["booked", "attended"])
    : { data: [] };
  const booked = new Map<string, number>();
  for (const b of bookings ?? []) booked.set(b.session_id, (booked.get(b.session_id) ?? 0) + 1);

  const offCoachIds = (timeOff ?? []).map((t) => t.coach_id);
  const { data: offCoaches } = offCoachIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", offCoachIds)
    : { data: [] };
  const { className, coachName } = await namesFor(admin, rows);
  for (const c of offCoaches ?? []) coachName.set(c.id, c.full_name);

  const sessionEvents: IcsEvent[] = rows.map((s) => ({
    uid: `session-${s.id}@fitnessblueprint`,
    summary: `${className.get(s.template_id) ?? "Session"} · ${coachName.get(s.coach_id) ?? "Coach TBC"}`,
    description: `${booked.get(s.id) ?? 0} booked`,
    url: `${siteUrl}/admin/program-calendar/sessions/${s.id}/workout`,
    ...sessionTimes(s),
  }));
  const timeOffEvents: IcsEvent[] = (timeOff ?? []).map((t) => ({
    uid: `timeoff-${t.id}@fitnessblueprint`,
    summary: `${coachName.get(t.coach_id) ?? "Coach"} off${t.note ? ` (${t.note})` : ""}`,
    url: `${siteUrl}/admin/time-off`,
    start: { date: t.starts_on },
    end: { date: nextDay(t.ends_on) }, // all-day DTEND is exclusive
  }));

  return buildCalendar("Fitness Blueprint — gym calendar", [...sessionEvents, ...timeOffEvents]);
}
