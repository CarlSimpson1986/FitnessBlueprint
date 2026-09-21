export function HabitStreakGrid({ days, habitCount }: { days: { date: string; count: number }[]; habitCount: number }) {
  const activeDays = days.filter((d) => d.count > 0).length;

  return (
    <div className="fb-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-blueprint-ink font-medium text-sm">Habit streak</p>
        <span className="text-xs text-blueprint-muted">{activeDays} of {days.length} days</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const fraction = habitCount > 0 ? Math.min(1, day.count / habitCount) : 0;
          return (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} habit${day.count === 1 ? "" : "s"}`}
              className="aspect-square rounded"
              style={{
                backgroundColor: fraction === 0 ? "var(--fb-line)" : "var(--fb-accent)",
                opacity: fraction === 0 ? 1 : Math.max(0.3, fraction),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
