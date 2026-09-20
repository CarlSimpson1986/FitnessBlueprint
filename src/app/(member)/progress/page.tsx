import { requireProfile } from "@/lib/auth";
import { toLocalDateKey } from "@/lib/format";
import { computeWeekStreak } from "@/lib/progress";
import { computeChallengeProgress } from "@/lib/challenges";
import { HabitChecklist } from "./HabitChecklist";
import { WeighInForm } from "./WeighInForm";
import { ChallengesList, type ChallengeItem } from "./ChallengesList";

export default async function ProgressPage() {
  const { supabase, user } = await requireProfile();
  const today = toLocalDateKey(new Date());

  const [
    { data: attendedBookings },
    { data: weighIns },
    { data: habitDefinitions },
    { data: todaysLogs },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("session_id")
      .eq("member_id", user.id)
      .eq("status", "attended"),
    supabase
      .from("weigh_ins")
      .select("weight_kg, recorded_at")
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
  ]);

  const attendedSessionIds = (attendedBookings ?? []).map((b) => b.session_id);
  const { data: attendedSessions } = attendedSessionIds.length
    ? await supabase.from("sessions").select("session_date").in("id", attendedSessionIds)
    : { data: [] };

  const attendedDates = (attendedSessions ?? []).map((s) => s.session_date);
  const streak = computeWeekStreak(attendedDates);

  const weighInRows = weighIns ?? [];
  const weightDelta =
    weighInRows.length >= 2
      ? weighInRows[weighInRows.length - 1]!.weight_kg - weighInRows[0]!.weight_kg
      : null;

  const completedHabitIds = new Set((todaysLogs ?? []).map((l) => l.habit_id));
  const habits = (habitDefinitions ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    isCompleted: completedHabitIds.has(h.id),
  }));

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
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
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

        <div className="fb-card mb-4">
          <p className="text-blueprint-ink font-medium text-sm mb-3">Log your weight</p>
          <WeighInForm />
        </div>

        <HabitChecklist habits={habits} />

        <p className="fb-eyebrow mb-2 mt-6">Challenges</p>
        <ChallengesList challenges={challenges} />
      </div>
    </main>
  );
}
