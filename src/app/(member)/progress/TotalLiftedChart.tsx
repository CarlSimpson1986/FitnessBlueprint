function formatWeekLabel(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(" ", "");
}

export function TotalLiftedChart({ weeks }: { weeks: { weekStart: string; totalKg: number }[] }) {
  const max = Math.max(...weeks.map((w) => w.totalKg), 1);
  const allTimeTotal = weeks.reduce((sum, w) => sum + w.totalKg, 0);

  return (
    <div className="fb-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-blueprint-ink font-medium text-sm">Total lifted</p>
        <span className="text-xs text-blueprint-muted">
          {Math.round(allTimeTotal).toLocaleString()}kg last {weeks.length} weeks
        </span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 60 }}>
        {weeks.map((week, i) => {
          const isLast = i === weeks.length - 1;
          const heightPct = week.totalKg === 0 ? 2 : Math.max(6, (week.totalKg / max) * 100);
          return (
            <div
              key={week.weekStart}
              className="flex-1 rounded-t"
              style={{
                height: `${heightPct}%`,
                backgroundColor: isLast ? "var(--fb-accent)" : "var(--fb-line)",
              }}
              title={`${formatWeekLabel(week.weekStart)}: ${Math.round(week.totalKg)}kg`}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        {weeks.map((week, i) => (
          <span
            key={week.weekStart}
            className="flex-1 text-center text-[9px]"
            style={{ color: i === weeks.length - 1 ? "var(--fb-accent)" : "var(--fb-muted)" }}
          >
            {formatWeekLabel(week.weekStart)}
          </span>
        ))}
      </div>
    </div>
  );
}
