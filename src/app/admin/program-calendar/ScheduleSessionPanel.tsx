"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RepeatDays, weekdayOf } from "./RepeatDays";
import { createSessions } from "./schedule-actions";

type Template = { id: string; name: string; default_capacity: number };
type Coach = { id: string; full_name: string };

export function ScheduleSessionPanel({
  templates,
  coaches,
}: {
  templates: Template[];
  coaches: Coach[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>(() => [weekdayOf(new Date().toISOString().slice(0, 10))]);
  const [weeks, setWeeks] = useState(1);
  const [capacity, setCapacity] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      let succeeded = false;

      try {
        const result = await createSessions({
          templateId,
          coachId,
          startDate,
          startTime,
          weekdays,
          weeks,
          capacity: capacity ? Number(capacity) : null,
        });

        if (result.error) {
          setError(result.error);
        } else {
          const created = result.created ?? 0;
          const skipped = result.skipped ?? 0;
          setSuccess(
            `Scheduled ${created} class${created === 1 ? "" : "es"}` +
              (skipped > 0 ? ` (${skipped} already there, skipped).` : ".")
          );
          setStartTime("");
          setWeeks(1);
          setCapacity("");
          succeeded = true;
        }
      } catch {
        setError("Something went wrong — please try again.");
      }

      if (succeeded) {
        startTransition(() => {
          router.refresh();
        });
      }
    });
  }

  const inputClass =
    "w-full bg-blueprint-bg border border-blueprint-line rounded px-2 py-1.5 text-xs text-blueprint-ink focus:outline-none focus:border-blueprint-accent";

  if (templates.length === 0 || coaches.length === 0) {
    return (
      <p className="text-[10px] text-blueprint-muted">
        Need at least one active class and one coach/owner profile before scheduling sessions.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={inputClass}>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>
            {c.full_name}
          </option>
        ))}
      </select>

      <input
        type="date"
        required
        value={startDate}
        onChange={(e) => {
          setStartDate(e.target.value);
          if (e.target.value) setWeekdays([weekdayOf(e.target.value)]);
        }}
        className={inputClass}
      />
      <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />

      <input
        type="number"
        min={1}
        placeholder="Capacity"
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        className={inputClass}
      />

      <p className="text-[10px] text-blueprint-muted">Repeat on</p>
      <RepeatDays weekdays={weekdays} onWeekdaysChange={setWeekdays} weeks={weeks} onWeeksChange={setWeeks} compact />

      {error && <p className="text-[10px] text-red-400">{error}</p>}
      {success && <p className="text-[10px] text-blueprint-accent">{success}</p>}

      <button
        type="submit"
        disabled={isPending || weekdays.length === 0}
        className="w-full text-[10px] font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-3 py-2 disabled:opacity-50"
      >
        {isPending ? "Scheduling…" : "Schedule session"}
      </button>
    </form>
  );
}
