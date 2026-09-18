import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { ManageSessionsClient } from "./ManageSessionsClient";

export default async function ManageSessionsPage() {
  const { supabase } = await requireCoachOrOwner();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: sessions }, { data: templates }, { data: coaches }] = await Promise.all([
    supabase
      .from("sessions")
      .select("*")
      .eq("status", "scheduled")
      .gte("session_date", today)
      .order("session_date")
      .order("start_time"),
    supabase
      .from("session_templates")
      .select("id, name, default_capacity")
      .eq("is_active", true)
      .order("name"),
    supabase.from("profiles").select("id, full_name").in("role", ["coach", "owner"]).order("full_name"),
  ]);

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((s) => s.id);

  // Unlike the member-facing timetable (src/app/sessions/page.tsx), which
  // uses session_spots_taken() (status = 'booked' only) to check remaining
  // capacity, this admin view shows "how many are in this session" —
  // anyone not cancelled, including attended/no_show/excused, so the count
  // doesn't drop as a coach marks attendance after the fact.
  const { data: activeBookings } = await supabase
    .from("bookings")
    .select("session_id, status")
    .in("session_id", sessionIds.length > 0 ? sessionIds : [""])
    .neq("status", "cancelled");

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const coachById = new Map((coaches ?? []).map((c) => [c.id, c]));
  const spotsBySession = new Map<string, number>();
  for (const booking of activeBookings ?? []) {
    spotsBySession.set(booking.session_id, (spotsBySession.get(booking.session_id) ?? 0) + 1);
  }

  const enrichedSessions = sessionRows.map((session) => ({
    id: session.id,
    session_date: session.session_date,
    start_time: session.start_time,
    capacity: session.capacity,
    templateName: templateById.get(session.template_id)?.name ?? "Session",
    coachName: coachById.get(session.coach_id)?.full_name ?? "Coach TBC",
    spotsTaken: spotsBySession.get(session.id) ?? 0,
  }));

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">
          Coach
        </p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Manage sessions</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Schedule new timetable slots, or cancel one — anyone already booked gets their session
          cancelled and any spent credit refunded automatically.
        </p>

        <ManageSessionsClient
          templates={templates ?? []}
          coaches={coaches ?? []}
          sessions={enrichedSessions}
        />
      </div>
    </main>
  );
}
