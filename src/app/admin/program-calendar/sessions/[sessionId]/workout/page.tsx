import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoachOrOwner } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { WorkoutBuilder, type SegmentDraft } from "./WorkoutBuilder";

export default async function SessionWorkoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase } = await requireCoachOrOwner();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, session_date, start_time, template_id")
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

  const { data: segments } = await supabase
    .from("session_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order");

  const segmentIds = (segments ?? []).map((s) => s.id);
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("id, segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order")
    .in("segment_id", segmentIds.length > 0 ? segmentIds : [""])
    .order("sort_order");

  const exerciseIds = (exercises ?? []).map((e) => e.id);
  const { data: sets } = await supabase
    .from("session_exercise_sets")
    .select("id, exercise_id, target, rest_seconds, sort_order")
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : [""])
    .order("sort_order");

  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets ?? []) {
    const list = setsByExercise.get(set.exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.exercise_id, list);
  }

  const exercisesBySegment = new Map<string, typeof exercises>();
  for (const exercise of exercises ?? []) {
    const list = exercisesBySegment.get(exercise.segment_id) ?? [];
    list.push(exercise);
    exercisesBySegment.set(exercise.segment_id, list);
  }

  const initialSegments: SegmentDraft[] = (segments ?? []).map((segment) => ({
    key: segment.id,
    type: segment.type,
    label: segment.label ?? "",
    defaultRounds: segment.default_rounds,
    exercises: (exercisesBySegment.get(segment.id) ?? []).map((exercise) => ({
      key: exercise.id,
      name: exercise.name,
      metricType: exercise.metric_type,
      eachSide: exercise.each_side,
      tempo: exercise.tempo ?? "",
      note: exercise.note ?? "",
      videoUrl: exercise.video_url ?? "",
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        key: set.id,
        target: set.target ?? "",
        restSeconds: set.rest_seconds,
      })),
    })),
  }));

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

        <WorkoutBuilder sessionId={sessionId} initialSegments={initialSegments} />
      </div>
    </main>
  );
}
