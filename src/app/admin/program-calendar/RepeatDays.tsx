"use client";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Mon = 0 … Sun = 6, matching createSessions' weekdays. */
export function weekdayOf(dateKey: string) {
  return (new Date(`${dateKey}T00:00:00`).getDay() + 6) % 7;
}

/**
 * "Repeat weekly on M W F for 12 weeks" — the recurring half of adding a
 * class (createSessions, schedule-actions.ts).
 */
export function RepeatDays({
  weekdays,
  onWeekdaysChange,
  weeks,
  onWeeksChange,
  compact = false,
}: {
  weekdays: number[];
  onWeekdaysChange: (weekdays: number[]) => void;
  weeks: number;
  onWeeksChange: (weeks: number) => void;
  compact?: boolean;
}) {
  const text = compact ? "text-[10px]" : "text-xs";
  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="group" aria-label="Repeat on">
        {DAYS.map((label, day) => {
          const on = weekdays.includes(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={on}
              aria-label={DAY_NAMES[day]}
              onClick={() =>
                onWeekdaysChange(on ? weekdays.filter((d) => d !== day) : [...weekdays, day].sort((a, b) => a - b))
              }
              className={
                `flex-1 rounded border py-1.5 font-mono ${text} ` +
                (on
                  ? "border-blueprint-accent bg-blueprint-accent text-blueprint-bg"
                  : "border-blueprint-line text-blueprint-muted hover:text-blueprint-ink")
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      <label className={`flex items-center gap-2 ${text} text-blueprint-muted`}>
        for
        <input
          type="number"
          min={1}
          max={52}
          required
          value={weeks}
          onChange={(e) => onWeeksChange(Number(e.target.value))}
          className={`w-16 bg-blueprint-bg border border-blueprint-line rounded px-2 py-1 ${text} text-blueprint-ink focus:outline-none focus:border-blueprint-accent`}
        />
        weeks
      </label>
    </div>
  );
}
