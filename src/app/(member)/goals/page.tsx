import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { toLocalDateKey } from "@/lib/format";
import { bestLifts, currentValues, valueFor } from "@/lib/goal-tracking";
import { loadLoggedSets } from "@/lib/logged-sets";
import { GoalsScreen } from "./GoalsScreen";
import { HealthLocked } from "@/components/HealthLocked";

export default async function GoalsPage() {
  const { supabase, user, profile } = await requireProfile();

  const [{ data: activeGoalRow }, { data: bodyMetricRows }, { data: habitDefinitions }, { data: attendedBookings }, sets] =
    await Promise.all([
      supabase
        .from("goals")
        .select("type, metric, long_target, long_date, micro_target, checkin_date, barriers, habits, start_value")
        .eq("member_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("body_metrics")
        .select("weight_kg, waist_cm, hip_cm, body_fat_pct, recorded_at")
        .eq("member_id", user.id),
      supabase.from("habit_definitions").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("bookings").select("session_id").eq("member_id", user.id).eq("status", "attended"),
      loadLoggedSets(supabase, user.id),
    ]);

  const attendedIds = (attendedBookings ?? []).map((b) => b.session_id);
  const { data: attendedSessions } = attendedIds.length
    ? await supabase.from("sessions").select("session_date").in("id", attendedIds)
    : { data: [] };

  const values = currentValues({
    bodyRows: bodyMetricRows ?? [],
    sets,
    attendedDates: (attendedSessions ?? []).map((s) => s.session_date),
    bodyMetricsOn: profile.track_body_metrics,
    today: toLocalDateKey(new Date()),
  });
  const liftOptions = bestLifts(sets).filter((l) => l.bestKg !== null || l.bestReps !== null);

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
        startValue: activeGoalRow.start_value,
        nowValue: valueFor(values, activeGoalRow.metric),
      }
    : null;

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
          ← Home
        </Link>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-6">Goals</h1>

        {profile.health_consent ? (
          <GoalsScreen
            activeGoal={activeGoal}
            currentValues={values}
            liftOptions={liftOptions}
            habitOptions={habitDefinitions ?? []}
            bodyMetricsOn={profile.track_body_metrics}
          />
        ) : (
          <HealthLocked />
        )}
      </div>
    </main>
  );
}
