import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoachArea } from "@/lib/coach-permissions";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { WorkoutBuilder, type SegmentDraft } from "./WorkoutBuilder";
import { MemberWorkoutPreview } from "@/components/MemberWorkoutPreview";
import { SessionRoster } from "@/app/admin/today/SessionRoster";
import { loadSessionWorkout } from "@/lib/session-workout";

export default async function SessionWorkoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase, profile, access } = await requireCoachArea("programme");

  const { data: session } = await supabase
    .from("sessions")
    .select("id, session_date, start_time, template_id, coach_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    notFound();
  }

  const { data: template } = await supabase
    .from("session_templates")
    .select("name")
    .eq("id", session.template_id)
    .maybeSingle();

  const initialSegments: SegmentDraft[] = await loadSessionWorkout(supabase, sessionId);

  // Coaches view the program and track attendance; only the owner edits
  // (0024). A coach gets the session as-is: roster + readiness + the
  // workout as members see it, and can mark attendance on their own class.
  if (profile.role !== "owner") {
    const { data: coach } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.coach_id)
      .maybeSingle();
    const isMine = session.coach_id === profile.id;

    return (
      <main className="min-h-screen px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/admin/program-calendar"
            className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
          >
            ← Program calendar
          </Link>
          <p className="fb-eyebrow mb-1">{isMine ? "Your session" : "Session"}</p>
          <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">{template?.name ?? "Session"}</h1>
          <p className="text-blueprint-muted mb-8 text-sm">
            {formatSessionDate(session.session_date)} · {formatSessionTime(session.start_time)} ·{" "}
            {coach?.full_name ?? "Coach TBC"}
          </p>

          <div className="flex flex-col-reverse md:flex-row gap-8 items-start">
            {/* The roster is part of Today — hidden if Guy has turned that off for this coach. */}
            {access.today && (
              <div className="flex-1 w-full fb-card !p-0">
                <p className="fb-eyebrow px-4 pt-4 mb-3">Who&apos;s coming</p>
                <SessionRoster sessionId={sessionId} canMark={isMine} />
              </div>
            )}
            <MemberWorkoutPreview title={template?.name ?? "Session"} segments={initialSegments} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/admin/program-calendar"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Program calendar
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">
          {template?.name ?? "Session"} workout
        </h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          {formatSessionDate(session.session_date)} · {formatSessionTime(session.start_time)}. Build it here, or
          assign a saved template from the{" "}
          <Link href="/admin/program-calendar" className="text-blueprint-accent hover:opacity-80">
            program calendar
          </Link>
          . This becomes the Coming up card and live-logging screen members see.
        </p>

        <WorkoutBuilder
          sessionId={sessionId}
          initialSegments={initialSegments}
          previewTitle={template?.name ?? "Session"}
        />
      </div>
    </main>
  );
}
