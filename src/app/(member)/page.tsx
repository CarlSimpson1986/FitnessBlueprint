import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { BookingButton } from "./sessions/BookingButton";
import { FeedbackList } from "./FeedbackList";
import { EventsList, type EventItem } from "./EventsList";
import { ReadinessCheckin } from "./ReadinessCheckin";

const FEEDBACK_LOOKBACK_DAYS = 14;

export default async function HomePage() {
  const { supabase, user, profile } = await requireProfile();

  const today = new Date().toISOString().slice(0, 10);

  const { data: myBookingRows } = await supabase
    .from("bookings")
    .select("id, session_id")
    .eq("member_id", user.id)
    .eq("status", "booked");

  const bookedSessionIds = (myBookingRows ?? []).map((b) => b.session_id);

  const { data: sessions } = bookedSessionIds.length
    ? await supabase
        .from("sessions")
        .select("*")
        .in("id", bookedSessionIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
    : { data: [] };

  const sessionRows = sessions ?? [];
  const templateIds = Array.from(new Set(sessionRows.map((s) => s.template_id)));

  const { data: templates } = templateIds.length
    ? await supabase.from("session_templates").select("id, name").in("id", templateIds)
    : { data: [] };

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const bookingIdBySession = new Map((myBookingRows ?? []).map((b) => [b.session_id, b.id]));
  const firstName = profile.full_name.split(" ")[0];

  const feedbackLookbackStart = new Date();
  feedbackLookbackStart.setDate(feedbackLookbackStart.getDate() - FEEDBACK_LOOKBACK_DAYS);

  const { data: attendedBookings } = await supabase
    .from("bookings")
    .select("session_id")
    .eq("member_id", user.id)
    .eq("status", "attended");

  const attendedSessionIds = (attendedBookings ?? []).map((b) => b.session_id);

  const { data: attendedSessions } = attendedSessionIds.length
    ? await supabase
        .from("sessions")
        .select("id, session_date, start_time, template_id")
        .in("id", attendedSessionIds)
        .gte("session_date", feedbackLookbackStart.toISOString().slice(0, 10))
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: false })
    : { data: [] };

  const attendedSessionRows = attendedSessions ?? [];
  const feedbackTemplateIds = Array.from(
    new Set(attendedSessionRows.map((s) => s.template_id))
  );

  const { data: feedbackTemplates } = feedbackTemplateIds.length
    ? await supabase.from("session_templates").select("id, name").in("id", feedbackTemplateIds)
    : { data: [] };

  const feedbackTemplateById = new Map((feedbackTemplates ?? []).map((t) => [t.id, t.name]));

  const feedbackItems = attendedSessionRows.map((session) => ({
    sessionId: session.id,
    sessionDate: session.session_date,
    startTime: session.start_time,
    templateName: feedbackTemplateById.get(session.template_id) ?? "Session",
  }));

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("*")
    .or(`event_date.is.null,event_date.gte.${today}`)
    .order("event_date", { ascending: true })
    .limit(6);

  const eventRows = upcomingEvents ?? [];
  const eventIds = eventRows.map((e) => e.id);

  const { data: interestRows } = eventIds.length
    ? await supabase.from("event_interests").select("event_id, member_id").in("event_id", eventIds)
    : { data: [] };

  const interestCountByEvent = new Map<string, number>();
  const myInterestSet = new Set<string>();
  for (const row of interestRows ?? []) {
    interestCountByEvent.set(row.event_id, (interestCountByEvent.get(row.event_id) ?? 0) + 1);
    if (row.member_id === user.id) myInterestSet.add(row.event_id);
  }

  const eventItems: EventItem[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    eventType: e.event_type,
    eventDate: e.event_date,
    location: e.location,
    registrationUrl: e.registration_url,
    isPaid: e.is_paid,
    interestCount: interestCountByEvent.get(e.id) ?? 0,
    isInterested: myInterestSet.has(e.id),
  }));

  const [nextSession, ...restSessions] = sessionRows;
  const nextTemplate = nextSession ? templateById.get(nextSession.template_id) : undefined;
  const nextBookingId = nextSession ? bookingIdBySession.get(nextSession.id) ?? null : null;

  const { data: existingCheckin } = nextSession
    ? await supabase
        .from("readiness_checkins")
        .select("id")
        .eq("member_id", user.id)
        .eq("session_id", nextSession.id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="max-w-2xl mx-auto">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">Hey {firstName}</h1>

        {nextSession ? (
          <div className="fb-card-accent mb-4">
            <p className="fb-eyebrow mb-2">Coming up</p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-blueprint-ink font-medium">
                  {nextTemplate?.name ?? "Session"}
                </p>
                <p className="text-xs text-blueprint-muted mt-1">
                  {formatSessionDate(nextSession.session_date)} ·{" "}
                  {formatSessionTime(nextSession.start_time)}
                </p>
              </div>
              <BookingButton sessionId={nextSession.id} bookingId={nextBookingId} isFull={false} />
            </div>
            <ReadinessCheckin sessionId={nextSession.id} hasCheckedIn={!!existingCheckin} />
          </div>
        ) : (
          <div className="fb-card mb-4">
            <p className="text-blueprint-muted text-sm mb-3">
              Nothing booked yet — check the timetable to grab a session.
            </p>
            <Link href="/sessions" className="fb-btn-primary">
              View timetable
            </Link>
          </div>
        )}

        {restSessions.length > 0 && (
          <>
            <p className="fb-eyebrow mb-2 mt-6">Also upcoming</p>
            <ul className="space-y-2 mb-4">
              {restSessions.map((session) => {
                const template = templateById.get(session.template_id);
                const bookingId = bookingIdBySession.get(session.id) ?? null;
                return (
                  <li
                    key={session.id}
                    className="fb-card flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-blueprint-ink font-medium">
                        {formatSessionDate(session.session_date)} ·{" "}
                        {formatSessionTime(session.start_time)}
                      </p>
                      <p className="text-xs text-blueprint-muted mt-1">
                        {template?.name ?? "Session"}
                      </p>
                    </div>
                    <BookingButton sessionId={session.id} bookingId={bookingId} isFull={false} />
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {feedbackItems.length > 0 && (
          <>
            <p className="fb-eyebrow mb-2 mt-6">Rate your last session</p>
            <div className="mb-4">
              <FeedbackList items={feedbackItems} />
            </div>
          </>
        )}

        <p className="fb-eyebrow mb-2 mt-6">Events</p>
        <EventsList events={eventItems} />
      </div>
    </main>
  );
}
