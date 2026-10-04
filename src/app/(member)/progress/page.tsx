import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { toLocalDateKey } from "@/lib/format";
import {
  computeHabitStreakGrid,
  computePersonalRecords,
  computeWeekStreak,
  computeWeeklyTotalLifted,
} from "@/lib/progress";
import { loadLoggedSets } from "@/lib/logged-sets";
import { computeChallengeProgress } from "@/lib/challenges";
import { HabitChecklist } from "./HabitChecklist";
import { HealthLocked } from "@/components/HealthLocked";
import { HabitStreakGrid } from "./HabitStreakGrid";
import { BodyMetricsCard, type MetricPoint } from "./BodyMetricsCard";
import { TotalLiftedChart } from "./TotalLiftedChart";
import { PersonalRecords } from "./PersonalRecords";
import { ChallengesList, type ChallengeItem } from "./ChallengesList";

export default async function ProgressPage() {
  const { supabase, user, profile } = await requireProfile();
  // 0043: no health consent hides habits; the body-measurements opt-out hides weight.
  const healthOn = profile.health_consent === true;
  const metricsOn = healthOn && profile.track_body_metrics;
  const today = toLocalDateKey(new Date());

  const [
    { data: attendedBookings },
    { data: bodyMetricRows },
    { data: habitDefinitions },
    { data: todaysLogs },
    loggedSets,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("session_id")
      .eq("member_id", user.id)
      .eq("status", "attended"),
    supabase
      .from("body_metrics")
      .select("weight_kg, waist_cm, hip_cm, body_fat_pct, recorded_at")
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
    loadLoggedSets(supabase, user.id),
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
  const hipSeries: MetricPoint[] = (bodyMetricRows ?? [])
    .filter((r) => r.hip_cm !== null)
    .map((r) => ({ date: toLocalDateKey(new Date(r.recorded_at)), value: r.hip_cm! }));
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

        <div className={(metricsOn ? "grid-cols-2" : "grid-cols-1") + " grid gap-3 mb-4"}>
          {metricsOn && (
          <div className="fb-card text-center">
            <p className="text-lg font-semibold text-blueprint-ink">
              {weightDelta === null
                ? "—"
                : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}kg`}
            </p>
            <p className="text-xs text-blueprint-muted mt-1">Weight change</p>
          </div>
          )}
          <div className="fb-card text-center">
            <p className="text-lg font-semibold text-blueprint-ink">{streak}</p>
            <p className="text-xs text-blueprint-muted mt-1">
              week{streak === 1 ? "" : "s"} streak
            </p>
          </div>
        </div>

        <div className="space-y-4 mb-4">
          {metricsOn && <BodyMetricsCard weight={weightSeries} waist={waistSeries} hips={hipSeries} bodyFat={bodyFatSeries} />}
          <TotalLiftedChart weeks={weeklyTotals} />
          {healthOn && <HabitStreakGrid days={habitStreakGrid} habitCount={habits.length} />}
          <PersonalRecords records={personalRecords} />
        </div>

        {healthOn ? (
          <HabitChecklist habits={habits} />
        ) : (
          <HealthLocked body="Habits, check-ins, goals and Coach Ted need your OK to keep your health info." />
        )}

        <p className="fb-eyebrow mb-2 mt-6">Challenges</p>
        <ChallengesList challenges={challenges} />
      </div>
    </main>
  );
}
