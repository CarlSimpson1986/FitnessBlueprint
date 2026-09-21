import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { toLocalDateKey } from "@/lib/format";
import { ProgramCalendarClient, type DayCard } from "./ProgramCalendarClient";

const WEEK_OPTIONS = [1, 2, 4, 6] as const;
type WeekOption = (typeof WEEK_OPTIONS)[number];

function parseWeeks(value: string | undefined): WeekOption {
  const n = Number(value);
  return (WEEK_OPTIONS as readonly number[]).includes(n) ? (n as WeekOption) : 4;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default async function ProgramCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ weeks?: string; start?: string }>;
}) {
  const { supabase } = await requireCoachOrOwner();
  const params = await searchParams;

  const weeks = parseWeeks(params.weeks);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const requestedStart = params.start ? new Date(`${params.start}T00:00:00`) : today;
  // Snap to the Monday of that week so the grid's columns always line up
  // with the Mon-Sun header, matching how coaches think about a "week".
  const dayOfWeek = requestedStart.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const start = addDays(requestedStart, -daysSinceMonday);
  const days = weeks * 7;
  const end = addDays(start, days - 1);

  const startKey = toLocalDateKey(start);
  const endKey = toLocalDateKey(end);

  const [{ data: sessions }, { data: templates }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, session_date, start_time, template_id, coach_id")
      .eq("status", "scheduled")
      .gte("session_date", startKey)
      .lte("session_date", endKey)
      .order("session_date")
      .order("start_time"),
    supabase.from("workout_templates").select("id, name").order("name"),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const templateIds = [...new Set((sessions ?? []).map((s) => s.template_id))];
  const coachIds = [...new Set((sessions ?? []).map((s) => s.coach_id))];

  const [{ data: sessionTemplates }, { data: coaches }, { data: segments }] = await Promise.all([
    supabase.from("session_templates").select("id, name").in("id", templateIds.length > 0 ? templateIds : [""]),
    supabase.from("profiles").select("id, full_name").in("id", coachIds.length > 0 ? coachIds : [""]),
    supabase
      .from("session_segments")
      .select("id, session_id")
      .in("session_id", sessionIds.length > 0 ? sessionIds : [""]),
  ]);

  const segmentIds = (segments ?? []).map((s) => s.id);
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("id, segment_id")
    .in("segment_id", segmentIds.length > 0 ? segmentIds : [""]);

  const segmentBySessionCount = new Map<string, number>();
  for (const segment of segments ?? []) {
    segmentBySessionCount.set(segment.session_id, (segmentBySessionCount.get(segment.session_id) ?? 0) + 1);
  }

  const sessionIdBySegmentId = new Map((segments ?? []).map((s) => [s.id, s.session_id]));
  const exerciseCountBySession = new Map<string, number>();
  for (const exercise of exercises ?? []) {
    const sessionId = sessionIdBySegmentId.get(exercise.segment_id);
    if (!sessionId) continue;
    exerciseCountBySession.set(sessionId, (exerciseCountBySession.get(sessionId) ?? 0) + 1);
  }

  const classNameById = new Map((sessionTemplates ?? []).map((t) => [t.id, t.name]));
  const coachNameById = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));

  const cardsByDate = new Map<string, DayCard[]>();
  for (const session of sessions ?? []) {
    const card: DayCard = {
      sessionId: session.id,
      time: session.start_time.slice(0, 5),
      className: classNameById.get(session.template_id) ?? "Session",
      coachName: coachNameById.get(session.coach_id) ?? "Coach TBC",
      segmentCount: segmentBySessionCount.get(session.id) ?? 0,
      exerciseCount: exerciseCountBySession.get(session.id) ?? 0,
    };
    const list = cardsByDate.get(session.session_date) ?? [];
    list.push(card);
    cardsByDate.set(session.session_date, list);
  }

  const dayKeys = Array.from({ length: days }, (_, i) => toLocalDateKey(addDays(start, i)));

  const prevStart = toLocalDateKey(addDays(start, -days));
  const nextStart = toLocalDateKey(addDays(start, days));

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Program calendar</h1>
        <p className="text-blueprint-muted mb-6 text-sm leading-relaxed">
          See how a training block looks across the weeks. Assign a saved{" "}
          <Link href="/admin/workout-templates" className="text-blueprint-accent hover:opacity-80">
            workout template
          </Link>{" "}
          to any scheduled session, or open it to build one from scratch.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/program-calendar?weeks=${weeks}&start=${prevStart}`}
              className="text-xs font-mono text-blueprint-muted hover:text-blueprint-accent border border-blueprint-line rounded px-2 py-1"
            >
              ←
            </Link>
            <Link
              href={`/admin/program-calendar?weeks=${weeks}`}
              className="text-xs font-mono text-blueprint-muted hover:text-blueprint-accent border border-blueprint-line rounded px-2 py-1"
            >
              Today
            </Link>
            <Link
              href={`/admin/program-calendar?weeks=${weeks}&start=${nextStart}`}
              className="text-xs font-mono text-blueprint-muted hover:text-blueprint-accent border border-blueprint-line rounded px-2 py-1"
            >
              →
            </Link>
            <span className="text-xs text-blueprint-muted ml-2">
              {startKey} – {endKey}
            </span>
          </div>
          <div className="flex gap-2">
            {WEEK_OPTIONS.map((w) => (
              <Link
                key={w}
                href={`/admin/program-calendar?weeks=${w}${params.start ? `&start=${params.start}` : ""}`}
                className={
                  "text-xs font-mono uppercase tracking-wide rounded px-3 py-1.5 border " +
                  (w === weeks
                    ? "bg-blueprint-accent text-blueprint-bg border-blueprint-accent"
                    : "border-blueprint-line text-blueprint-muted hover:text-blueprint-ink")
                }
              >
                {w} week{w > 1 ? "s" : ""}
              </Link>
            ))}
          </div>
        </div>

        <ProgramCalendarClient
          dayKeys={dayKeys}
          cardsByDate={Object.fromEntries(cardsByDate)}
          templates={templates ?? []}
        />
      </div>
    </main>
  );
}
