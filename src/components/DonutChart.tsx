"use client";

import { useState } from "react";

export type DonutSegment = { label: string; value: number; color: string };

/**
 * Part-to-whole donut with an always-visible legend (values + %) so the
 * numbers are never hidden behind hover-only interaction — hover just
 * emphasises one segment, it isn't required to read the data.
 */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  formatValue,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  formatValue: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const radius = 60;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;

  let cumulative = 0;
  const arcs = segments.map((segment, i) => {
    const fraction = total > 0 ? segment.value / total : 0;
    const dash = Math.max(fraction * circumference - gap, 0);
    const offset = circumference - cumulative;
    cumulative += fraction * circumference;
    return { ...segment, dash, offset, fraction, i };
  });

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <svg width={140} height={140} viewBox="0 0 140 140">
          <circle cx={70} cy={70} r={radius} fill="none" stroke="var(--fb-line)" strokeWidth={strokeWidth} />
          {total > 0 &&
            arcs
              .filter((arc) => arc.value > 0)
              .map((arc) => (
                <circle
                  key={arc.label}
                  cx={70}
                  cy={70}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                  strokeDashoffset={arc.offset}
                  strokeLinecap="round"
                  transform="rotate(-90 70 70)"
                  opacity={hovered === null || hovered === arc.i ? 1 : 0.35}
                  onMouseEnter={() => setHovered(arc.i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ transition: "opacity 120ms", cursor: "pointer" }}
                >
                  <title>
                    {`${arc.label}: ${formatValue(arc.value)} (${Math.round(arc.fraction * 100)}%)`}
                  </title>
                </circle>
              ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-lg font-semibold text-blueprint-ink">{centerValue}</p>
          <p className="text-[10px] text-blueprint-muted text-center px-4">{centerLabel}</p>
        </div>
      </div>

      <ul className="space-y-2 flex-1 min-w-[180px]">
        {segments.map((segment, i) => {
          const fraction = total > 0 ? segment.value / total : 0;
          return (
            <li
              key={segment.label}
              className="flex items-center justify-between gap-3 text-sm cursor-default"
              style={{ opacity: hovered === null || hovered === i ? 1 : 0.5, transition: "opacity 120ms" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="flex items-center gap-2 text-blueprint-ink min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: segment.color }} />
                <span className="truncate">{segment.label}</span>
              </span>
              <span className="text-blueprint-muted shrink-0 whitespace-nowrap">
                {formatValue(segment.value)} · {Math.round(fraction * 100)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
