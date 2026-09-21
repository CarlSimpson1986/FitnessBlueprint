"use client";

import { useState } from "react";
import { METRIC_TYPE_LABEL, type MetricType } from "@/lib/workout-content";

const UNIT_BY_METRIC: Record<MetricType, string> = {
  weight_kg: "kg",
  weight_kg_and_reps: "kg",
  reps_only: "reps",
  time_seconds: "sec",
  distance_m: "m",
};

const DEFAULT_VISIBLE = 3;

export function PersonalRecords({
  records,
}: {
  records: { exerciseName: string; metricType: MetricType; best: number }[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (records.length === 0) {
    return (
      <div className="fb-card">
        <p className="text-blueprint-ink font-medium text-sm mb-2">Personal records</p>
        <p className="text-xs text-blueprint-muted">Log a few sessions to start building these out.</p>
      </div>
    );
  }

  const visible = expanded ? records : records.slice(0, DEFAULT_VISIBLE);

  return (
    <div className="fb-card">
      <p className="text-blueprint-ink font-medium text-sm mb-3">Personal records</p>
      <ul className="space-y-2">
        {visible.map((record) => (
          <li key={record.exerciseName} className="flex items-center justify-between">
            <span className="text-sm text-blueprint-ink">{record.exerciseName}</span>
            <span className="text-xs text-blueprint-muted">
              {record.best % 1 === 0 ? record.best : record.best.toFixed(1)} {UNIT_BY_METRIC[record.metricType]}
              <span className="ml-1 text-[10px]">({METRIC_TYPE_LABEL[record.metricType]})</span>
            </span>
          </li>
        ))}
      </ul>
      {records.length > DEFAULT_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blueprint-accent hover:opacity-80 mt-3"
        >
          {expanded ? "Show less" : `See all (${records.length})`}
        </button>
      )}
    </div>
  );
}
