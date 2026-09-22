"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assignTemplateToSession } from "../workout-templates/actions";
import { CancelSessionButton } from "./CancelSessionButton";

export type DayCard = {
  sessionId: string;
  time: string;
  className: string;
  coachName: string;
  segmentCount: number;
  exerciseCount: number;
};

const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function formatDayNumber(dateKey: string) {
  return Number(dateKey.slice(8, 10));
}

function isFirstOfMonth(dateKey: string, index: number, dayKeys: string[]) {
  if (index === 0) return true;
  const prev = dayKeys[index - 1];
  return prev !== undefined && prev.slice(0, 7) !== dateKey.slice(0, 7);
}

function SessionCard({
  card,
  templates,
}: {
  card: DayCard;
  templates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function handleAssign() {
    if (!selectedTemplate) return;
    setError(null);
    startTransition(async () => {
      const result = await assignTemplateToSession(selectedTemplate, card.sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setExpanded(false);
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <div className="border border-blueprint-line rounded bg-blueprint-raised/60 p-2 text-left">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <p className="text-[11px] font-medium text-blueprint-accent">
          {card.time} — {card.className}
        </p>
        <p className="text-[10px] text-blueprint-muted mt-0.5">{card.coachName}</p>
        <p className="text-[10px] text-blueprint-muted mt-1">
          {card.segmentCount === 0
            ? "No workout yet"
            : `${card.segmentCount} segment${card.segmentCount === 1 ? "" : "s"} · ${card.exerciseCount} exercise${card.exerciseCount === 1 ? "" : "s"}`}
        </p>
      </button>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-blueprint-line/60 space-y-1.5">
          <Link
            href={`/admin/program-calendar/sessions/${card.sessionId}/workout`}
            className="block text-[10px] font-mono uppercase tracking-wide text-blueprint-accent hover:opacity-80"
          >
            Open builder →
          </Link>
          <div className="flex gap-1">
            <select
              className="flex-1 bg-blueprint-bg border border-blueprint-line rounded text-[10px] text-blueprint-ink px-1.5 py-1"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Assign template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAssign}
              disabled={!selectedTemplate || isPending}
              className="text-[10px] font-mono uppercase text-blueprint-bg bg-blueprint-accent rounded px-2 disabled:opacity-50"
            >
              {isPending ? "…" : "Go"}
            </button>
          </div>
          {error && <p className="text-[10px] text-red-400">{error}</p>}
          <CancelSessionButton sessionId={card.sessionId} />
        </div>
      )}
    </div>
  );
}

export function ProgramCalendarClient({
  dayKeys,
  cardsByDate,
  templates,
}: {
  dayKeys: string[];
  cardsByDate: Record<string, DayCard[]>;
  templates: { id: string; name: string }[];
}) {
  const weeks: string[][] = [];
  for (let i = 0; i < dayKeys.length; i += 7) {
    weeks.push(dayKeys.slice(i, i + 7));
  }

  const todayKey = new Date();
  todayKey.setHours(0, 0, 0, 0);
  const todayIso =
    `${todayKey.getFullYear()}-${String(todayKey.getMonth() + 1).padStart(2, "0")}-${String(todayKey.getDate()).padStart(2, "0")}`;

  return (
    <div>
      <div className="grid grid-cols-7 gap-2 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label} className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted px-1">
            {label}
          </p>
        ))}
      </div>

      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-2 mb-2">
          {week.map((dateKey, dayIndex) => {
            const globalIndex = weekIndex * 7 + dayIndex;
            const cards = cardsByDate[dateKey] ?? [];
            const isToday = dateKey === todayIso;

            return (
              <div
                key={dateKey}
                className={
                  "min-h-[110px] rounded border p-1.5 space-y-1.5 " +
                  (isToday ? "border-blueprint-accent" : "border-blueprint-line/60")
                }
              >
                <p className="text-[10px] text-blueprint-muted px-0.5">
                  {isFirstOfMonth(dateKey, globalIndex, dayKeys)
                    ? new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : formatDayNumber(dateKey)}
                </p>
                {cards.map((card) => (
                  <SessionCard key={card.sessionId} card={card} templates={templates} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
