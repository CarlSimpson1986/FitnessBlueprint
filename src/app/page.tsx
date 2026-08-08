import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { BookingButton } from "./sessions/BookingButton";

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

        <div className="flex flex-wrap gap-3">
          <Link
            href="/sessions"
            className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-3 hover:opacity-90 transition"
          >
            View timetable
          </Link>
          {profile.role === "owner" && (
            <Link
              href="/owner/members"
              className="text-xs font-mono uppercase tracking-wide text-blueprint-ink border border-blueprint-line rounded px-4 py-3 hover:border-blueprint-accent transition"
            >
              Manage members
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
