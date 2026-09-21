"use client";

import { useState } from "react";
import Link from "next/link";

export type MetricPoint = { date: string; value: number };

const METRICS = [
  { key: "weight", label: "Weight", unit: "kg" },
  { key: "waist", label: "Waist", unit: "cm" },
  { key: "bodyFat", label: "Body fat", unit: "%" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

function Trend({ series, unit }: { series: MetricPoint[]; unit: string }) {
  if (series.length < 2) {
    return (
      <p className="text-xs text-blueprint-muted text-center py-6">
        Log a couple of entries to see a trend here.
      </p>
    );
  }

  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 300;
  const height = 70;
  const step = width / (series.length - 1);

  const points = series.map((p, i) => {
    const x = i * step;
    const y = height - ((p.value - min) / range) * height;
    return `${x},${y}`;
  });

  const first = series[0]!;
  const last = series[series.length - 1]!;
  const delta = last.value - first.value;

  return (
    <div>
      <p className="text-xs text-blueprint-muted mb-2">
        {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`} since first log
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: 70 }}>
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="var(--fb-accent)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={0} cy={height - ((first.value - min) / range) * height} r={3} fill="var(--fb-accent)" />
        <circle
          cx={width}
          cy={height - ((last.value - min) / range) * height}
          r={3}
          fill="var(--fb-accent)"
        />
      </svg>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-blueprint-muted">
          {first.date} · {first.value}
          {unit}
        </span>
        <span className="text-[10px] text-blueprint-muted">
          {last.date} · {last.value}
          {unit}
        </span>
      </div>
    </div>
  );
}

export function BodyMetricsCard({
  weight,
  waist,
  bodyFat,
}: {
  weight: MetricPoint[];
  waist: MetricPoint[];
  bodyFat: MetricPoint[];
}) {
  const [active, setActive] = useState<MetricKey>("weight");
  const seriesByKey: Record<MetricKey, MetricPoint[]> = { weight, waist, bodyFat };

  return (
    <div className="fb-card">
      <div className="flex items-center justify-between mb-2">
        <p className="text-blueprint-ink font-medium text-sm">Body metrics</p>
        <Link href="/progress/log-metrics" className="text-xs text-blueprint-accent hover:opacity-80">
          + Update
        </Link>
      </div>
      <div className="flex gap-1.5 mb-3">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActive(m.key)}
            className={
              active === m.key
                ? "flex-1 text-xs font-medium text-black bg-blueprint-accent rounded px-2 py-1.5 transition"
                : "flex-1 text-xs text-blueprint-muted border border-blueprint-line rounded px-2 py-1.5 hover:border-blueprint-accent transition"
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      <Trend series={seriesByKey[active]} unit={METRICS.find((m) => m.key === active)!.unit} />
    </div>
  );
}
