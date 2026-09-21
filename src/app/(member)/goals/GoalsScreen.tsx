"use client";

import { useState } from "react";
import { GoalWizard } from "./GoalWizard";
import type { GoalType } from "./goals-actions";

type ActiveGoal = {
  type: GoalType;
  metric: string;
  longTarget: string;
  longDate: string | null;
  microTarget: string;
  checkinDate: string;
  barriers: string | null;
  habits: string[];
};

const TYPE_LABEL: Record<GoalType, string> = {
  lose_weight: "Lose weight",
  build_strength: "Build strength",
  general_fitness: "General fitness",
  event_prep: "Event prep",
};

export function GoalsScreen({
  activeGoal,
  weightBaseline,
  bodyFatBaseline,
  habitOptions,
}: {
  activeGoal: ActiveGoal | null;
  weightBaseline: number | null;
  bodyFatBaseline: number | null;
  habitOptions: { id: string; name: string }[];
}) {
  const [showWizard, setShowWizard] = useState(!activeGoal);

  if (showWizard) {
    return (
      <GoalWizard
        mode={activeGoal ? "checkin" : "full"}
        previousGoal={activeGoal ?? undefined}
        weightBaseline={weightBaseline}
        bodyFatBaseline={bodyFatBaseline}
        habitOptions={habitOptions}
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
