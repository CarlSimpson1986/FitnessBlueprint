import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { BookingButton } from "./sessions/BookingButton";
import { FeedbackList } from "./FeedbackList";

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

  return (
    <main className="blueprint-grid min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-10">Hey {firstName}</h1>

        <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-3">
          Your upcoming bookings
        </h2>

        {sessionRows.length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-10">
            Nothing booked yet — check the timetable to grab a session.
          </p>
        ) : (
          <ul className="space-y-3 mb-10">
            {sessionRows.map((session) => {
              const template = templateById.get(session.template_id);
              const bookingId = bookingIdBySession.get(session.id) ?? null;
              return (
                <li
                  key={session.id}
                  className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-3"
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
        )}

        {feedbackItems.length > 0 && (
          <>
            <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-3">
              Rate your last session
            </h2>
            <div className="mb-10">
              <FeedbackList items={feedbackItems} />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/sessions"
            className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-3 hover:opacity-90 transition"
          >
            View timetable
          </Link>
          <Link
            href="/account"
            className="text-xs font-mono uppercase tracking-wide text-blueprint-ink border border-blueprint-line rounded px-4 py-3 hover:border-blueprint-accent transition"
          >
            Account
          </Link>
          {(profile.role === "owner" || profile.role === "coach") && (
            <Link
              href="/admin"
              className="text-xs font-mono uppercase tracking-wide text-blueprint-ink border border-blueprint-line rounded px-4 py-3 hover:border-blueprint-accent transition"
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
