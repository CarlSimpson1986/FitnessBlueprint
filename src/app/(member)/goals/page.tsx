import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { GoalsScreen } from "./GoalsScreen";

export default async function GoalsPage() {
  const { supabase, user } = await requireProfile();

  const [{ data: activeGoalRow }, { data: bodyMetricRows }, { data: habitDefinitions }] = await Promise.all([
    supabase
      .from("goals")
      .select("type, metric, long_target, long_date, micro_target, checkin_date, barriers, habits")
      .eq("member_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("body_metrics")
      .select("weight_kg, body_fat_pct, recorded_at")
      .eq("member_id", user.id)
      .order("recorded_at", { ascending: false }),
    supabase.from("habit_definitions").select("id, name").eq("is_active", true).order("sort_order"),
  ]);

  const weightBaseline = (bodyMetricRows ?? []).find((r) => r.weight_kg !== null)?.weight_kg ?? null;
  const bodyFatBaseline = (bodyMetricRows ?? []).find((r) => r.body_fat_pct !== null)?.body_fat_pct ?? null;

  const activeGoal = activeGoalRow
    ? {
        type: activeGoalRow.type,
        metric: activeGoalRow.metric,
        longTarget: activeGoalRow.long_target,
        longDate: activeGoalRow.long_date,
        microTarget: activeGoalRow.micro_target,
        checkinDate: activeGoalRow.checkin_date,
        barriers: activeGoalRow.barriers,
        habits: activeGoalRow.habits,
      }
    : null;

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-6">Goals</h1>

        <GoalsScreen
          activeGoal={activeGoal}
          weightBaseline={weightBaseline}
          bodyFatBaseline={bodyFatBaseline}
          habitOptions={habitDefinitions ?? []}
        />
      </div>
    </main>
  );
}
