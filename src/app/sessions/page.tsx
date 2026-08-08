import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingButton } from "./BookingButton";

function formatDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(timeStr: string) {
  return timeStr.slice(0, 5);
}

export default async function SessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("*")
    .eq("status", "scheduled")
    .gte("session_date", today)
    .order("session_date")
    .order("start_time");

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((s) => s.id);

  const [{ data: templates }, { data: coaches }, { data: myBookings }, { data: spotsTaken }] =
    await Promise.all([
      supabase.from("session_templates").select("id, name"),
      supabase.from("profiles").select("id, full_name").in("role", ["coach", "owner"]),
      supabase
        .from("bookings")
        .select("id, session_id")
        .eq("member_id", user.id)
        .eq("status", "booked")
        .in("session_id", sessionIds),
      supabase.rpc("session_spots_taken", { p_session_ids: sessionIds }),
    ]);

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const coachById = new Map((coaches ?? []).map((c) => [c.id, c]));
  const myBookingBySession = new Map((myBookings ?? []).map((b) => [b.session_id, b.id]));
  const spotsBySession = new Map(
    (spotsTaken ?? []).map((s) => [s.session_id, Number(s.spots_taken)])
  );

  const sessionsByDate = new Map<string, typeof sessionRows>();
  for (const session of sessionRows) {
    const list = sessionsByDate.get(session.session_date) ?? [];
    list.push(session);
    sessionsByDate.set(session.session_date, list);
  }

  return (
    <main className="blueprint-grid min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-10">Timetable</h1>

        {sessionsByDate.size === 0 && (
          <p className="text-blueprint-muted text-sm">No upcoming sessions scheduled yet.</p>
        )}

        <div className="space-y-10">
          {Array.from(sessionsByDate.entries()).map(([date, daySessions]) => (
            <section key={date}>
              <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-muted uppercase mb-3">
                {formatDate(date)}
              </h2>
              <ul className="space-y-3">
                {daySessions.map((session) => {
                  const template = templateById.get(session.template_id);
                  const coach = coachById.get(session.coach_id);
                  const bookingId = myBookingBySession.get(session.id) ?? null;
                  const taken = spotsBySession.get(session.id) ?? 0;
                  const isFull = taken >= session.capacity;

                  return (
                    <li
                      key={session.id}
                      className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-3"
                    >
                      <div>
                        <p className="text-blueprint-ink font-medium">
                          {formatTime(session.start_time)} — {template?.name ?? "Session"}
                        </p>
                        <p className="text-xs text-blueprint-muted mt-1">
                          {coach ? coach.full_name : "Coach TBC"} · {taken}/{session.capacity}{" "}
                          booked
                        </p>
                      </div>
                      <BookingButton
                        sessionId={session.id}
                        bookingId={bookingId}
                        isFull={isFull}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
