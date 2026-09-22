import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { formatSessionTime, toLocalDateKey } from "@/lib/format";
import { SessionRoster } from "./SessionRoster";

export default async function TodayPage() {
  const { supabase } = await requireCoachOrOwner();

  const today = toLocalDateKey(new Date());

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, start_time, template_id, coach_id")
    .eq("status", "scheduled")
    .eq("session_date", today)
    .order("start_time");

  const sessionRows = sessions ?? [];
  const templateIds = [...new Set(sessionRows.map((s) => s.template_id))];
  const coachIds = [...new Set(sessionRows.map((s) => s.coach_id))];

  const [{ data: templates }, { data: coaches }] = await Promise.all([
    supabase.from("session_templates").select("id, name").in("id", templateIds.length > 0 ? templateIds : [""]),
    supabase.from("profiles").select("id, full_name").in("id", coachIds.length > 0 ? coachIds : [""]),
  ]);

  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Today</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Mark attendance and see readiness check-ins for today&apos;s sessions.
        </p>

        {sessionRows.length === 0 ? (
          <p className="text-blueprint-muted text-sm">No sessions scheduled today.</p>
        ) : (
          <ul className="space-y-4">
            {sessionRows.map((session) => (
              <li key={session.id} className="border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded">
                <div className="px-4 py-3">
                  <p className="text-blueprint-ink font-medium">
                    {formatSessionTime(session.start_time)} — {templateNameById.get(session.template_id) ?? "Session"}
                  </p>
                  <p className="text-xs text-blueprint-muted mt-1">
                    {coachNameById.get(session.coach_id) ?? "Coach TBC"}
                  </p>
                </div>
                <SessionRoster sessionId={session.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
