import { requireProfile } from "@/lib/auth";
import { toLocalDateKey } from "@/lib/format";
import { computeWeekStreak } from "@/lib/progress";
import { HabitChecklist } from "./HabitChecklist";
import { WeighInForm } from "./WeighInForm";

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
      </div>
    </main>
  );
}
