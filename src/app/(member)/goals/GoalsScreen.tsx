"use client";

import Link from "next/link";
import { useState } from "react";
import { GoalWizard } from "./GoalWizard";
import type { GoalType } from "./goals-actions";
import { formatValue, goalProgress, isBodyGoalMetric, type LiftBest } from "@/lib/goal-tracking";

type ActiveGoal = {
  type: GoalType;
  metric: string;
  longTarget: string;
  longDate: string | null;
  microTarget: string;
  checkinDate: string;
  barriers: string | null;
  habits: string[];
  startValue: number | null;
  /** Their latest number for the metric, when the app can measure it. */
  nowValue: number | null;
};

const TYPE_LABEL: Record<GoalType, string> = {
  lose_weight: "Lose fat",
  build_muscle: "Build muscle",
  build_strength: "Get stronger",
  general_fitness: "General fitness",
  event_prep: "Event prep",
};

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center">
      <p className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">{label}</p>
      <p className="text-sm font-medium text-blueprint-ink">{value}</p>
    </div>
  );
}

function GoalTracker({ goal }: { goal: ActiveGoal }) {
  const target = parseFloat(goal.microTarget);
  const show = (v: number | null) => (v === null ? "—" : formatValue(v, goal.metric));
  const progress = goalProgress(goal.startValue, goal.nowValue, goal.microTarget);

  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <Figure label="Start" value={show(goal.startValue)} />
        <span className="text-blueprint-muted">→</span>
        <Figure label="Now" value={show(goal.nowValue)} />
        <span className="text-blueprint-muted">→</span>
        <Figure label="Target" value={Number.isFinite(target) ? formatValue(target, goal.metric) : goal.microTarget} />
      </div>
      {progress !== null && (
        <div className="h-1.5 rounded-full bg-blueprint-line overflow-hidden">
          <div className="h-full bg-blueprint-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {goal.nowValue === null &&
        (isBodyGoalMetric(goal.metric) ? (
          <Link href="/progress/log-metrics" className="block text-xs text-blueprint-accent hover:opacity-80">
            Log a measurement to see where you&apos;re at →
          </Link>
        ) : (
          <p className="text-xs text-blueprint-muted">Tell Ted where you&apos;re at at your 6-week check-in.</p>
        ))}
    </div>
  );
}

export function GoalsScreen({
  activeGoal,
  currentValues,
  liftOptions,
  habitOptions,
  bodyMetricsOn,
}: {
  activeGoal: ActiveGoal | null;
  currentValues: Record<string, number>;
  liftOptions: LiftBest[];
  habitOptions: { id: string; name: string }[];
  bodyMetricsOn: boolean;
}) {
  const [showWizard, setShowWizard] = useState(!activeGoal);

  if (showWizard) {
    return (
      <GoalWizard
        mode={activeGoal ? "checkin" : "full"}
        previousGoal={activeGoal ?? undefined}
        currentValues={currentValues}
        liftOptions={liftOptions}
        habitOptions={habitOptions}
        bodyMetricsOn={bodyMetricsOn}
      />
    );
  }

  return (
    <div className="fb-card-accent space-y-3">
      <div>
        <p className="fb-eyebrow mb-1">{TYPE_LABEL[activeGoal!.type]}</p>
        <p className="text-blueprint-ink font-medium">
          {activeGoal!.metric}: {activeGoal!.microTarget}
        </p>
        <p className="text-xs text-blueprint-muted mt-1">
          6-week check-in due {new Date(`${activeGoal!.checkinDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </p>
      </div>
      <GoalTracker goal={activeGoal!} />
      {activeGoal!.longTarget && (
        <p className="text-xs text-blueprint-muted">
          Big picture: {activeGoal!.metric} {activeGoal!.longTarget}
          {activeGoal!.longDate ? ` by ${new Date(`${activeGoal!.longDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
        </p>
      )}
      {activeGoal!.habits.length > 0 && (
        <p className="text-xs text-blueprint-muted">Habits: {activeGoal!.habits.join(", ")}</p>
      )}
      <button type="button" onClick={() => setShowWizard(true)} className="fb-btn-primary w-full">
        6-week check-in
      </button>
    </div>
  );
}
