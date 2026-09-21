import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { toLocalDateKey } from "@/lib/format";
import {
  computeHabitStreakGrid,
  computePersonalRecords,
  computeWeekStreak,
  computeWeeklyTotalLifted,
  type LoggedSet,
} from "@/lib/progress";
import { computeChallengeProgress } from "@/lib/challenges";
import { HabitChecklist } from "./HabitChecklist";
import { HabitStreakGrid } from "./HabitStreakGrid";
import { BodyMetricsCard, type MetricPoint } from "./BodyMetricsCard";
import { TotalLiftedChart } from "./TotalLiftedChart";
import { PersonalRecords } from "./PersonalRecords";
import { ChallengesList, type ChallengeItem } from "./ChallengesList";

export default async function ProgressPage() {
  const { supabase, user } = await requireProfile();
  const today = toLocalDateKey(new Date());

  const [
    { data: attendedBookings },
    { data: bodyMetricRows },
    { data: habitDefinitions },
    { data: todaysLogs },
    { data: exerciseLogRows },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("session_id")
      .eq("member_id", user.id)
      .eq("status", "attended"),
    supabase
      .from("body_metrics")
      .select("weight_kg, waist_cm, body_fat_pct, recorded_at")
      .eq("member_id", user.id)
      .order("recorded_at", { ascending: true }),
    supabase
      .from("habit_definitions")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("habit_logs")
      .select("habit_id")
      .eq("member_id", user.id)
      .eq("log_date", today),
    supabase
      .from("exercise_logs")
      .select("exercise_id, weight_kg, reps, time_seconds, distance_m")
      .eq("member_id", user.id),
  ]);

  const attendedSessionIds = (attendedBookings ?? []).map((b) => b.session_id);
  const { data: attendedSessions } = attendedSessionIds.length
    ? await supabase.from("sessions").select("session_date").in("id", attendedSessionIds)
    : { data: [] };

  const attendedDates = (attendedSessions ?? []).map((s) => s.session_date);
  const streak = computeWeekStreak(attendedDates);

  const weightSeries: MetricPoint[] = (bodyMetricRows ?? [])
    .filter((r) => r.weight_kg !== null)
    .map((r) => ({ date: toLocalDateKey(new Date(r.recorded_at)), value: r.weight_kg! }));
  const waistSeries: MetricPoint[] = (bodyMetricRows ?? [])
    .filter((r) => r.waist_cm !== null)
    .map((r) => ({ date: toLocalDateKey(new Date(r.recorded_at)), value: r.waist_cm! }));
  const bodyFatSeries: MetricPoint[] = (bodyMetricRows ?? [])
    .filter((r) => r.body_fat_pct !== null)
    .map((r) => ({ date: toLocalDateKey(new Date(r.recorded_at)), value: r.body_fat_pct! }));

  const weightDelta =
    weightSeries.length >= 2 ? weightSeries[weightSeries.length - 1]!.value - weightSeries[0]!.value : null;

  const completedHabitIds = new Set((todaysLogs ?? []).map((l) => l.habit_id));
  const habits = (habitDefinitions ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    isCompleted: completedHabitIds.has(h.id),
  }));

  // Total lifted / personal records need each log's session date and its
  // exercise's name + metric type — exercise_logs only has exercise_id, so
  // this is a manual 3-hop join (exercise -> segment -> session), same
  // "no data-layer abstraction, join in JS" convention as the rest of this
  // codebase's Server Components.
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

  const weeklyTotals = computeWeeklyTotalLifted(loggedSets, 6);
  const personalRecords = computePersonalRecords(loggedSets);

  const [
    { data: allHabitLogs },
    { data: challengeRows },
    { data: myParticipantRows },
    { data: allParticipantRows },
  ] = await Promise.all([
    supabase.from("habit_logs").select("log_date").eq("member_id", user.id),
    supabase.from("challenges").select("*").gte("ends_at", today).order("starts_at"),
    supabase.from("challenge_participants").select("challenge_id").eq("member_id", user.id),
    supabase.from("challenge_participants").select("challenge_id"),
  ]);

  const habitLogDates = (allHabitLogs ?? []).map((l) => l.log_date);
  const habitStreakGrid = computeHabitStreakGrid(habitLogDates, 14);
  const joinedChallengeIds = new Set((myParticipantRows ?? []).map((p) => p.challenge_id));

  const participantCountByChallenge = new Map<string, number>();
  for (const row of allParticipantRows ?? []) {
    participantCountByChallenge.set(
      row.challenge_id,
      (participantCountByChallenge.get(row.challenge_id) ?? 0) + 1
    );
  }

  const challenges: ChallengeItem[] = (challengeRows ?? []).map((c) => {
    const isJoined = joinedChallengeIds.has(c.id);
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      type: c.type,
      isOpen: c.is_open,
      targetValue: c.target_value,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      participantCount: participantCountByChallenge.get(c.id) ?? 0,
      isJoined,
      progress: isJoined
        ? computeChallengeProgress(
            c.type,
            { startsAt: c.starts_at, endsAt: c.ends_at },
            { attendedSessionDates: attendedDates, habitLogDates }
          )
        : null,
    };
  });

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-1">
          <p className="fb-eyebrow">Fitness Blueprint</p>
          <HomeLink />
        </div>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">Progress</h1>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="fb-card text-center">
            <p className="text-lg font-semibold text-blueprint-ink">
              {weightDelta === null
                ? "—"
                : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg`}
            </p>
            <p className="text-xs text-blueprint-muted mt-1">Weight change</p>
          </div>
          <div className="fb-card text-center">
            <p className="text-lg font-semibold text-blueprint-ink">{streak}</p>
            <p className="text-xs text-blueprint-muted mt-1">
              week{streak === 1 ? "" : "s"} streak
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-4">
          <BodyMetricsCard weight={weightSeries} waist={waistSeries} bodyFat={bodyFatSeries} />
          <TotalLiftedChart weeks={weeklyTotals} />
          <HabitStreakGrid days={habitStreakGrid} habitCount={habits.length} />
          <PersonalRecords records={personalRecords} />
        </div>

        <HabitChecklist habits={habits} />

        <p className="fb-eyebrow mb-2 mt-6">Challenges</p>
        <ChallengesList challenges={challenges} />
      </div>
    </main>
  );
}
