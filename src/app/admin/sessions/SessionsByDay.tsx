"use client";

import { formatSessionTime, toLocalDateKey } from "@/lib/format";
import { CancelSessionButton } from "./CancelSessionButton";

type EnrichedSession = {
  id: string;
  session_date: string;
  start_time: string;
  capacity: number;
  templateName: string;
  coachName: string;
  spotsTaken: number;
};

function buildDayRange(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function SessionsByDay({
  sessions,
  selected,
  onSelectDate,
}: {
  sessions: EnrichedSession[];
  selected: string;
  onSelectDate: (date: string) => void;
}) {
  const days = buildDayRange(14);

  const sessionsByDate = new Map<string, EnrichedSession[]>();
  for (const session of sessions) {
    const list = sessionsByDate.get(session.session_date) ?? [];
    list.push(session);
    sessionsByDate.set(session.session_date, list);
  }

  const selectedSessions = (sessionsByDate.get(selected) ?? [])
    .slice()
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-6 -mx-1 px-1">
        {days.map((day) => {
          const key = toLocalDateKey(day);
          const hasSessions = sessionsByDate.has(key);
          const isSelected = key === selected;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={
                "flex-shrink-0 flex flex-col items-center rounded px-3 py-2 border transition " +
                (isSelected
                  ? "bg-blueprint-accent text-blueprint-bg border-blueprint-accent"
                  : "border-blueprint-line text-blueprint-ink hover:border-blueprint-accent")
              }
            >
              <span className="text-[10px] font-mono uppercase tracking-wide opacity-80">
                {day.toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
              <span className="text-sm font-medium">{day.getDate()}</span>
              <span
                className={
                  "mt-1 h-1 w-1 rounded-full " +
                  (hasSessions
                    ? isSelected
                      ? "bg-blueprint-bg"
                      : "bg-blueprint-accent"
                    : "bg-transparent")
                }
              />
            </button>
          );
        })}
      </div>

      {selectedSessions.length === 0 ? (
        <p className="text-blueprint-muted text-sm">No sessions scheduled this day.</p>
      ) : (
        <ul className="space-y-3">
          {selectedSessions.map((session) => (
            <li
              key={session.id}
              className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-3"
            >
              <div>
                <p className="text-blueprint-ink font-medium">
                  {formatSessionTime(session.start_time)} — {session.templateName}
                </p>
                <p className="text-xs text-blueprint-muted mt-1">
                  {session.coachName} · {session.spotsTaken}/{session.capacity} booked
                </p>
              </div>
              <CancelSessionButton sessionId={session.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
