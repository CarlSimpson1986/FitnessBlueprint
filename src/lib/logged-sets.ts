import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { LoggedSet } from "@/lib/progress";

/**
 * Every set a member has logged, with its session date and exercise name +
 * metric type. exercise_logs only has exercise_id, so this is a manual
 * 3-hop join (exercise -> segment -> session) in JS — the codebase's "no
 * data-layer abstraction" convention. Used by Progress (totals, PRs) and
 * Goals (current best on a lift). Pass the RLS client: "exercise_logs:
 * read" scopes it to what the caller may see.
 */
export async function loadLoggedSets(supabase: SupabaseClient<Database>, memberId: string): Promise<LoggedSet[]> {
  const { data: exerciseLogRows } = await supabase
    .from("exercise_logs")
    .select("exercise_id, weight_kg, reps, time_seconds, distance_m")
    .eq("member_id", memberId);

  const exerciseIds = [...new Set((exerciseLogRows ?? []).map((l) => l.exercise_id))];
  const { data: exerciseRows } = exerciseIds.length
    ? await supabase.from("session_exercises").select("id, name, metric_type, segment_id").in("id", exerciseIds)
    : { data: [] };

  const segmentIds = [...new Set((exerciseRows ?? []).map((e) => e.segment_id))];
  const { data: segmentRows } = segmentIds.length
    ? await supabase.from("session_segments").select("id, session_id").in("id", segmentIds)
    : { data: [] };

  const sessionIds = [...new Set((segmentRows ?? []).map((s) => s.session_id))];
  const { data: sessionRows } = sessionIds.length
    ? await supabase.from("sessions").select("id, session_date").in("id", sessionIds)
    : { data: [] };

  const sessionDateBySession = new Map((sessionRows ?? []).map((s) => [s.id, s.session_date]));
  const sessionIdBySegment = new Map((segmentRows ?? []).map((s) => [s.id, s.session_id]));
  const exerciseById = new Map((exerciseRows ?? []).map((e) => [e.id, e]));

  const loggedSets: LoggedSet[] = [];
  for (const log of exerciseLogRows ?? []) {
    const exercise = exerciseById.get(log.exercise_id);
    if (!exercise) continue;
    const sessionId = sessionIdBySegment.get(exercise.segment_id);
    const sessionDate = sessionId ? sessionDateBySession.get(sessionId) : undefined;
    if (!sessionDate) continue;

    loggedSets.push({
      sessionDate,
      exerciseName: exercise.name,
      metricType: exercise.metric_type,
      weightKg: log.weight_kg,
      reps: log.reps,
      timeSeconds: log.time_seconds,
      distanceM: log.distance_m,
    });
  }
  return loggedSets;
}
