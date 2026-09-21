import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { FinishScreen } from "./FinishScreen";

export default async function FinishSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const { supabase, user } = await requireProfile();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, template_id, coach_id, duration_minutes")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    notFound();
  }

  // See src/app/(member)/sessions/[sessionId]/live/page.tsx for why this is
  // list_coach_names() and not a raw profiles query.
  const [{ data: template }, { data: coachNames }] = await Promise.all([
    supabase.from("session_templates").select("name").eq("id", session.template_id).maybeSingle(),
    supabase.rpc("list_coach_names"),
  ]);
  const coachName = (coachNames ?? []).find((c) => c.id === session.coach_id)?.full_name;

  const { data: segments } = await supabase
    .from("session_segments")
    .select("id")
    .eq("session_id", sessionId);

  const segmentIds = (segments ?? []).map((s) => s.id);
  const { data: exercises } = await supabase
    .from("session_exercises")
    .select("id, metric_type")
    .in("segment_id", segmentIds.length > 0 ? segmentIds : [""]);

  const metricByExercise = new Map((exercises ?? []).map((e) => [e.id, e.metric_type]));
  const exerciseIds = (exercises ?? []).map((e) => e.id);

  const { data: logs } = await supabase
    .from("exercise_logs")
    .select("exercise_id, weight_kg, reps")
    .eq("member_id", user.id)
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : [""]);

  // Total lifted is computed at read time (no stored counter), same
  // convention as src/lib/progress.ts — sums this session's logged rows:
  // weight_kg contributes as-is, weight_kg_and_reps contributes weight x reps.
  let totalKg = 0;
  for (const log of logs ?? []) {
    const metricType = metricByExercise.get(log.exercise_id);
    if (metricType === "weight_kg" && log.weight_kg) {
      totalKg += log.weight_kg;
    } else if (metricType === "weight_kg_and_reps" && log.weight_kg && log.reps) {
      totalKg += log.weight_kg * log.reps;
    }
  }

  const horses = Math.max(1, Math.round(totalKg / 250));

  return (
    <FinishScreen
      sessionId={sessionId}
      className={template?.name ?? "Session"}
      durationMinutes={session.duration_minutes}
      coachName={coachName ?? "your coach"}
      totalKg={totalKg}
      horses={horses}
    />
  );
}
