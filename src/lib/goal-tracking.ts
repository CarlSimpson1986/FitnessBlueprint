import { loggedKg, type LoggedSet } from "@/lib/progress";

/**
 * What a goal's `metric` label means, and the member's current number for
 * it, so the Goals card can show Start -> Now -> Target. goals.metric is a
 * free label (0016), so the shapes below are conventions the wizard writes:
 * a body measurement label, "Total lifted (kg)", "Sessions/week", or
 * "<lift> (kg|reps)". Anything else is the member's own and has no
 * automatic "now".
 */

export const BODY_GOAL_METRICS = {
  "Weight (kg)": "weight_kg",
  "Waist (cm)": "waist_cm",
  "Hips (cm)": "hip_cm",
  "Body fat %": "body_fat_pct",
} as const;

export type BodyGoalMetric = keyof typeof BODY_GOAL_METRICS;

export const TOTAL_LIFTED = "Total lifted (kg)";
export const SESSIONS_PER_WEEK = "Sessions/week";

export function isBodyGoalMetric(metric: string): metric is BodyGoalMetric {
  return metric in BODY_GOAL_METRICS;
}

/** "Back squat (kg)" -> { name: "Back squat", unit: "kg" }; null if it isn't a lift. */
export function parseLiftMetric(metric: string): { name: string; unit: "kg" | "reps" } | null {
  if (isBodyGoalMetric(metric) || metric === TOTAL_LIFTED) return null;
  const match = /^(.+?) \((kg|reps)\)$/.exec(metric);
  return match ? { name: match[1]!.trim(), unit: match[2] as "kg" | "reps" } : null;
}

/** The unit a metric's numbers are in, for display ("kg", "%", "min"...). */
export function unitOf(metric: string): string {
  if (metric === "Body fat %") return "%";
  if (metric === SESSIONS_PER_WEEK) return "a week";
  return /\(([^)]+)\)$/.exec(metric)?.[1] ?? "";
}

export function formatValue(value: number, metric: string): string {
  const unit = unitOf(metric);
  const n = Math.round(value * 10) / 10;
  if (!unit) return String(n);
  return unit === "kg" || unit === "cm" || unit === "%" ? `${n}${unit}` : `${n} ${unit}`;
}

export type LiftBest = { name: string; bestKg: number | null; bestReps: number | null; lastDate: string };

/** Heaviest weight and most reps per exercise, most recently trained first. */
export function bestLifts(sets: LoggedSet[]): LiftBest[] {
  const byName = new Map<string, LiftBest>();
  for (const set of sets) {
    const key = set.exerciseName.trim().toLowerCase();
    const entry = byName.get(key) ?? { name: set.exerciseName.trim(), bestKg: null, bestReps: null, lastDate: set.sessionDate };
    if (set.weightKg !== null && (set.metricType === "weight_kg" || set.metricType === "weight_kg_and_reps")) {
      entry.bestKg = Math.max(entry.bestKg ?? 0, set.weightKg);
    }
    if (set.reps !== null && (set.metricType === "reps_only" || set.metricType === "weight_kg_and_reps")) {
      entry.bestReps = Math.max(entry.bestReps ?? 0, set.reps);
    }
    if (set.sessionDate > entry.lastDate) entry.lastDate = set.sessionDate;
    byName.set(key, entry);
  }
  return [...byName.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

type BodyRow = {
  weight_kg: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  body_fat_pct: number | null;
  recorded_at: string;
};

/**
 * The member's latest number for every metric we can measure, keyed by
 * lower-cased metric label — look up with valueFor(). Body measurements are
 * left out when the member has opted out of them (0043).
 */
export function currentValues({
  bodyRows,
  sets,
  attendedDates,
  bodyMetricsOn,
  today,
}: {
  bodyRows: BodyRow[];
  sets: LoggedSet[];
  attendedDates: string[];
  bodyMetricsOn: boolean;
  /** YYYY-MM-DD, UK. */
  today: string;
}): Record<string, number> {
  const values: Record<string, number> = {};

  if (bodyMetricsOn) {
    const newestFirst = [...bodyRows].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
    for (const [label, column] of Object.entries(BODY_GOAL_METRICS)) {
      const latest = newestFirst.find((r) => r[column] !== null)?.[column];
      if (latest !== undefined && latest !== null) values[label.toLowerCase()] = Number(latest);
    }
  }

  for (const lift of bestLifts(sets)) {
    if (lift.bestKg !== null) values[`${lift.name} (kg)`.toLowerCase()] = lift.bestKg;
    if (lift.bestReps !== null) values[`${lift.name} (reps)`.toLowerCase()] = lift.bestReps;
  }

  // "Per week" numbers are the last 7 days, today included.
  const weekAgo = new Date(`${today}T00:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
  const from = weekAgo.toISOString().slice(0, 10);
  const inLastWeek = (date: string) => date >= from && date <= today;

  if (sets.length) {
    values[TOTAL_LIFTED.toLowerCase()] = Math.round(
      sets.filter((s) => inLastWeek(s.sessionDate)).reduce((sum, s) => sum + loggedKg(s), 0)
    );
  }
  values[SESSIONS_PER_WEEK.toLowerCase()] = attendedDates.filter(inLastWeek).length;

  return values;
}

export function valueFor(values: Record<string, number>, metric: string): number | null {
  return values[metric.toLowerCase()] ?? null;
}

/** How far from start to target `now` is, 0–1; null when it can't be worked out. */
export function goalProgress(start: number | null, now: number | null, targetText: string): number | null {
  const target = parseFloat(targetText);
  if (start === null || now === null || !Number.isFinite(target) || target === start) return null;
  return Math.min(1, Math.max(0, (now - start) / (target - start)));
}
