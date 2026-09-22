import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import type { MetricType, SegmentType } from "@/lib/workout-content";
import { suggestNextWeight } from "@/lib/exercise-progression";
import { LiveLogging, type LiveSegment } from "./LiveLogging";

export default async function LiveSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase, user } = await requireProfile();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("session_id", sessionId)
    .eq("member_id", user.id)
    .in("status", ["booked", "attended"])
    .maybeSingle();

  if (!booking) {
    redirect("/");
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id, template_id, coach_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    notFound();
  }

  // A plain member can't read another profile's row directly (RLS only
  // grants "read own"), so the coach's name has to come from the narrow
  // list_coach_names() RPC (0011), not a raw profiles query — same fix
  // that was needed for "Coach TBC" on the member timetable.
  const [{ data: template }, { data: coachNames }] = await Promise.all([
    supabase.from("session_templates").select("name").eq("id", session.template_id).maybeSingle(),
    supabase.rpc("list_coach_names"),
  ]);
  const coachName = (coachNames ?? []).find((c) => c.id === session.coach_id)?.full_name;

  const { data: segments } = await supabase
    .from("session_segments")
    .select("id, type, label, sort_order")
    .eq("session_id", sessionId)
    .order("sort_order");

  const segmentIds = (segments ?? []).map((s) => s.id);
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("id, segment_id, name, metric_type, each_side, sort_order")
    .in("segment_id", segmentIds.length > 0 ? segmentIds : [""])
    .order("sort_order");

  const exerciseIds = (exercises ?? []).map((e) => e.id);
  const { data: sets } = await supabase
    .from("session_exercise_sets")
    .select("id, exercise_id, set_number, target, sort_order")
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : [""])
    .order("sort_order");

  const { data: logs } = await supabase
    .from("exercise_logs")
    .select("set_id, weight_kg, reps, time_seconds, distance_m")
    .eq("member_id", user.id)
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : [""]);

  const logBySet = new Map((logs ?? []).map((l) => [l.set_id, l]));

  // "Last time you did X" reference — matched by exercise NAME, not id,
  // since the same movement gets a brand-new session_exercises row every
  // week (same convention progress.ts already uses for personal
  // records). Excludes this session's own exercise ids so a set the
  // member already logged a moment ago in THIS session never shows up
  // as its own "history".
  const exerciseNames = [...new Set((exercises ?? []).map((e) => e.name))];
  const currentExerciseIdSet = new Set((exercises ?? []).map((e) => e.id));

  const { data: historicalExercises } = exerciseNames.length
    ? await supabase.from("session_exercises").select("id, name").in("name", exerciseNames)
    : { data: [] };

  const nameByHistoricalId = new Map((historicalExercises ?? []).map((e) => [e.id, e.name]));
  const historicalIds = (historicalExercises ?? [])
    .map((e) => e.id)
    .filter((id) => !currentExerciseIdSet.has(id));

  const { data: historyLogs } = historicalIds.length
    ? await supabase
        .from("exercise_logs")
        .select("exercise_id, weight_kg, reps, logged_at")
        .eq("member_id", user.id)
        .in("exercise_id", historicalIds)
        .not("weight_kg", "is", null)
        .order("logged_at", { ascending: false })
    : { data: [] };

  const lastLogByName = new Map<string, { weightKg: number; reps: number | null }>();
  for (const log of historyLogs ?? []) {
    const name = nameByHistoricalId.get(log.exercise_id);
    // historyLogs is ordered most-recent-first, so the first hit per
    // name is already the one we want — skip any later, older ones.
    if (!name || lastLogByName.has(name) || log.weight_kg === null) continue;
    lastLogByName.set(name, { weightKg: log.weight_kg, reps: log.reps });
  }
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

  const liveSegments: LiveSegment[] = (segments ?? []).map((segment) => ({
    id: segment.id,
    type: segment.type as SegmentType,
    label: segment.label,
    exercises: (exercisesBySegment.get(segment.id) ?? []).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      metricType: exercise.metric_type as MetricType,
      eachSide: exercise.each_side,
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => {
        const log = logBySet.get(set.id);
        const lastLog = lastLogByName.get(exercise.name);
        const suggestion = lastLog ? suggestNextWeight(lastLog.weightKg, lastLog.reps, set.target) : null;
        return {
          id: set.id,
          setNumber: set.set_number,
          target: set.target,
          weightKg: log?.weight_kg ?? null,
          reps: log?.reps ?? null,
          timeSeconds: log?.time_seconds ?? null,
          distanceM: log?.distance_m ?? null,
          lastWeightKg: lastLog?.weightKg ?? null,
          lastReps: lastLog?.reps ?? null,
          suggestedKg: suggestion?.suggestedKg ?? null,
          suggestionBasis: suggestion?.basis ?? null,
        };
      }),
    })),
  }));

  if (liveSegments.length === 0) {
    return (
      <main className="min-h-screen px-5 py-8 pb-24">
        <div className="max-w-2xl mx-auto">
          <p className="fb-eyebrow mb-1">{template?.name ?? "Session"}</p>
          <h1 className="text-2xl font-semibold text-blueprint-ink mb-4">No workout yet</h1>
          <p className="text-blueprint-muted text-sm">
            Your coach hasn&apos;t built today&apos;s workout yet — check back closer to the session.
          </p>
        </div>
      </main>
    );
  }

  return (
    <LiveLogging
      sessionId={sessionId}
      className={template?.name ?? "Session"}
      coachName={coachName ?? "your coach"}
      initialSegments={liveSegments}
    />
  );
}
