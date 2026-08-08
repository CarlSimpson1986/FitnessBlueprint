"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSessions } from "./actions";

type Template = { id: string; name: string; default_capacity: number };
type Coach = { id: string; full_name: string };

export function CreateSessionForm({
  templates,
  coaches,
  selectedDate,
}: {
  templates: Template[];
  coaches: Coach[];
  selectedDate: string;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [startDate, setStartDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState("");

  // Clicking a day in the picker below re-populates this field. The user
  // can still freely edit it afterward — it only jumps again on the next
  // day-picker click. Adjusted during render (React's sanctioned pattern
  // for "derive from a prop but allow local override") rather than in a
  // useEffect, which would cause an extra render pass.
  const [prevSelectedDate, setPrevSelectedDate] = useState(selectedDate);
  if (selectedDate !== prevSelectedDate) {
    setPrevSelectedDate(selectedDate);
    setStartDate(selectedDate);
  }

  const [weeksToRepeat, setWeeksToRepeat] = useState(1);
  const [capacity, setCapacity] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      let succeeded = false;

      try {
        const result = await createSessions({
          templateId,
          coachId,
          startDate,
          startTime,
          weeksToRepeat,
          capacity: capacity ? Number(capacity) : null,
        });

        if (result.error) {
          setError(result.error);
        } else {
          setSuccess(true);
          setStartDate(selectedDate);
          setStartTime("");
          setWeeksToRepeat(1);
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

  if (templates.length === 0 || coaches.length === 0) {
    return (
      <p className="text-xs text-blueprint-muted mb-10">
        Need at least one session type and one coach/owner profile before scheduling sessions.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-10 border border-blueprint-line/60 rounded p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Session type
        </label>
        <select
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Coach
        </label>
        <select
          value={coachId}
          onChange={(event) => setCoachId(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        >
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          First date
        </label>
        <input
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Start time
        </label>
        <input
          type="time"
          required
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Repeat weekly for
        </label>
        <input
          type="number"
          min={1}
          max={26}
          required
          value={weeksToRepeat}
          onChange={(event) => setWeeksToRepeat(Number(event.target.value))}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
        <p className="text-xs text-blueprint-muted mt-1">weeks (1 = just this one)</p>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Capacity
        </label>
        <input
          type="number"
          min={1}
          placeholder="Uses session type default"
          value={capacity}
          onChange={(event) => setCapacity(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {isPending ? "Scheduling…" : "Schedule session"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-blueprint-accent">Scheduled.</p>}
      </div>
    </form>
  );
}
