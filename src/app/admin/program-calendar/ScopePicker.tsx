"use client";

import type { SeriesScope } from "./schedule-actions";

/** "This class only" / "This and every later Tuesday 18:00" — Guy builds a year at a time. */
export function ScopePicker({
  name,
  dateKey,
  time,
  value,
  onChange,
}: {
  name: string;
  dateKey: string;
  time: string;
  value: SeriesScope;
  onChange: (scope: SeriesScope) => void;
}) {
  const weekday = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
  const options: [SeriesScope, string][] = [
    ["one", "This class only"],
    ["following", `This and every later ${weekday} ${time}`],
  ];

  return (
    <div className="space-y-1">
      {options.map(([scope, label]) => (
        <label key={scope} className="flex items-start gap-1.5 text-[10px] text-blueprint-ink">
          <input
            type="radio"
            name={name}
            checked={value === scope}
            onChange={() => onChange(scope)}
            className="mt-0.5 accent-blueprint-accent"
          />
          {label}
        </label>
      ))}
    </div>
  );
}
