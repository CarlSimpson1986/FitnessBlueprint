import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { CreateEventForm } from "./CreateEventForm";

export default async function ManageEventsPage() {
  const { supabase } = await requireCoachOrOwner();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: events }, { data: interestRows }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .or(`event_date.is.null,event_date.gte.${today}`)
      .order("event_date", { ascending: true }),
    supabase.from("event_interests").select("event_id"),
  ]);

  const interestCountByEvent = new Map<string, number>();
  for (const row of interestRows ?? []) {
    interestCountByEvent.set(row.event_id, (interestCountByEvent.get(row.event_id) ?? 0) + 1);
  }

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Events</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Post gym events (races, socials) — members see these alongside events they post
          themselves, and can register interest.
        </p>

        <CreateEventForm />

        <p className="fb-eyebrow mb-3">Upcoming</p>
        {(events ?? []).length === 0 ? (
          <p className="text-blueprint-muted text-sm">Nothing posted yet.</p>
        ) : (
          <ul className="space-y-2">
            {(events ?? []).map((event) => (
              <li
                key={event.id}
                className="border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-4"
              >
                <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-1">
                  {event.event_type === "gym" ? "Gym" : "Member posted"}
                  {event.is_paid ? " · Paid" : ""}
                </p>
                <p className="text-blueprint-ink font-medium">{event.title}</p>
                <p className="text-xs text-blueprint-muted mt-1">
                  {event.event_date ?? "Date TBC"}
                  {event.location ? ` · ${event.location}` : ""} ·{" "}
                  {interestCountByEvent.get(event.id) ?? 0} interested
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
