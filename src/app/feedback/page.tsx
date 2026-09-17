import { requireProfile } from "@/lib/auth";
import { FeedbackList } from "./FeedbackList";

const LOOKBACK_DAYS = 14;

export default async function FeedbackPage() {
  const { supabase, user } = await requireProfile();

  const today = new Date();
  const lookbackStart = new Date(today);
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("session_id")
    .eq("member_id", user.id)
    .eq("status", "attended");

  const sessionIds = (bookings ?? []).map((b) => b.session_id);

  const { data: sessions } = sessionIds.length
    ? await supabase
        .from("sessions")
        .select("id, session_date, start_time, template_id")
        .in("id", sessionIds)
        .gte("session_date", lookbackStart.toISOString().slice(0, 10))
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: false })
    : { data: [] };

  const sessionRows = sessions ?? [];
  const templateIds = Array.from(new Set(sessionRows.map((s) => s.template_id)));

  const { data: templates } = templateIds.length
    ? await supabase.from("session_templates").select("id, name").in("id", templateIds)
    : { data: [] };

  const templateById = new Map((templates ?? []).map((t) => [t.id, t.name]));

  const items = sessionRows.map((session) => ({
    sessionId: session.id,
    sessionDate: session.session_date,
    startTime: session.start_time,
    templateName: templateById.get(session.template_id) ?? "Session",
  }));

  return (
    <main className="blueprint-grid min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint
        </p>
        <h1 className="font-display text-3xl text-blueprint-ink mb-2">Rate your sessions</h1>
        <p className="text-xs text-blueprint-muted mb-10">
          Quick and private — only the owner sees these.
        </p>

        <FeedbackList items={items} />
      </div>
    </main>
  );
}
