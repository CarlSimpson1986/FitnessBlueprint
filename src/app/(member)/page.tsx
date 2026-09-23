import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { BookingButton } from "./sessions/BookingButton";
import { FeedbackList } from "./FeedbackList";
import { EventsList, type EventItem } from "./EventsList";
import { ReadinessCheckin } from "./ReadinessCheckin";
import { TedWalkaround } from "@/components/TedWalkaround";
import { openCheckinWeek } from "@/lib/weekly-checkin";

const FEEDBACK_LOOKBACK_DAYS = 14;

export default async function HomePage() {
  const { supabase, user, profile } = await requireProfile();

  // Coaches/owner have no bookings of their own to see here — this page
  // is the member "book a session" home. Send staff straight to /admin
  // instead of showing them a client's homepage.
  if (profile.role !== "member") {
    redirect("/admin");
  }

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

  // Onboarding checklist + goal check-in banner: computed at read time from
  // whether rows exist, no stored "onboarding done" flag on profiles —
  // same convention as everywhere else in this codebase.
  const [{ data: anyGoalRow }, { data: anyBodyMetricRow }, { data: activeGoalRow }] = await Promise.all([
    supabase.from("goals").select("id").eq("member_id", user.id).limit(1).maybeSingle(),
    supabase.from("body_metrics").select("id").eq("member_id", user.id).limit(1).maybeSingle(),
    supabase
      .from("goals")
      .select("checkin_date")
      .eq("member_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Sunday–Wednesday: Ted prompts this week's check-in until it's done.
  const checkinWeek = openCheckinWeek();
  const { data: thisWeeksCheckin } = checkinWeek
    ? await supabase
        .from("weekly_checkins")
        .select("id")
        .eq("member_id", user.id)
        .eq("week_of", checkinWeek)
        .maybeSingle()
    : { data: null };
  const weeklyCheckinOpen = checkinWeek !== null && !thisWeeksCheckin;

  const hasSetGoals = !!anyGoalRow;
  const hasLoggedMetrics = !!anyBodyMetricRow;
  const showOnboarding = !hasSetGoals || !hasLoggedMetrics;
  const checkinDue = activeGoalRow ? new Date(`${activeGoalRow.checkin_date}T00:00:00`) <= new Date() : false;

  return (
    <main className="min-h-screen px-5 py-8">
      {!profile.has_seen_ted_tour && <TedWalkaround />}
      <div className="max-w-2xl mx-auto">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">Hey {firstName}</h1>

        {showOnboarding && (
          <div className="fb-card-accent mb-4">
            <p className="fb-eyebrow mb-2">Get set up</p>
            <p className="text-blueprint-ink font-medium mb-3">Welcome to Fitness Blueprint</p>
            <div className="space-y-0.5">
              <Link
                href="/goals"
                className="flex items-center justify-between py-2 border-b border-blueprint-line/60"
              >
                <span className="flex items-center gap-2 text-sm text-blueprint-ink">
                  <span
                    className="inline-block w-4 h-4 rounded-full border"
                    style={{
                      borderColor: hasSetGoals ? "var(--fb-accent)" : "var(--fb-line)",
                      backgroundColor: hasSetGoals ? "var(--fb-accent)" : "transparent",
                    }}
                  />
                  Set your goals with Coach Ted
                </span>
                <span className="text-blueprint-muted text-xs">›</span>
              </Link>
              <Link href="/progress/log-metrics" className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2 text-sm text-blueprint-ink">
                  <span
                    className="inline-block w-4 h-4 rounded-full border"
                    style={{
                      borderColor: hasLoggedMetrics ? "var(--fb-accent)" : "var(--fb-line)",
                      backgroundColor: hasLoggedMetrics ? "var(--fb-accent)" : "transparent",
                    }}
                  />
                  Log your starting body metrics
                </span>
                <span className="text-blueprint-muted text-xs">›</span>
              </Link>
            </div>
          </div>
        )}

        {weeklyCheckinOpen && (
          <Link href="/check-in" className="fb-card-accent mb-4 flex items-center gap-3">
            <Image
              src="/coach-ted.png"
              alt=""
              width={36}
              height={36}
              className="rounded-full object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-blueprint-ink font-medium">Your weekly check-in&apos;s ready</p>
              <p className="text-xs text-blueprint-muted mt-0.5">One minute with Ted — how was your week?</p>
            </div>
            <span className="text-xs text-blueprint-accent whitespace-nowrap">Check in →</span>
          </Link>
        )}

        {checkinDue && (
          <Link href="/goals" className="fb-card-accent mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-blueprint-ink">Your 6-week goal check-in is due.</p>
            <span className="text-xs text-blueprint-accent whitespace-nowrap">Check in →</span>
          </Link>
        )}

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
            <Link
              href={`/sessions/${nextSession.id}/live`}
              className="fb-btn-primary block text-center mt-3"
            >
              Start session
            </Link>
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
