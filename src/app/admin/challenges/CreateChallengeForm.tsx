"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createChallenge } from "./actions";
import type { ChallengeType } from "@/lib/challenges";

const TYPE_OPTIONS: { value: ChallengeType; label: string }[] = [
  { value: "attendance", label: "Attendance (auto-tracked)" },
  { value: "habit", label: "Habit (auto-tracked)" },
  { value: "event_prep", label: "Event prep (you track manually)" },
  { value: "team", label: "Team (you track manually)" },
];

export function CreateChallengeForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ChallengeType>("attendance");
  const [isOpen, setIsOpen] = useState(true);
  const [targetValue, setTargetValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await createChallenge({
        title,
        description,
        type,
        isOpen,
        targetValue: Number(targetValue),
        startsAt,
        endsAt,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setTitle("");
      setDescription("");
      setTargetValue("");
      setStartsAt("");
      setEndsAt("");
      setSuccess(true);
      startTransition(() => router.refresh());
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-10 border border-blueprint-line/60 rounded p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      <div className="sm:col-span-2">
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Title
        </label>
        <input
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Type
        </label>
        <select
          value={type}
          onChange={(event) => setType(event.target.value as ChallengeType)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Target
        </label>
        <input
          type="number"
          min={1}
          required
          value={targetValue}
          onChange={(event) => setTargetValue(event.target.value)}
          placeholder="e.g. 18 sessions"
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Starts
        </label>
        <input
          type="date"
          required
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Ends
        </label>
        <input
          type="date"
          required
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm text-blueprint-ink">
          <input
            type="checkbox"
            checked={isOpen}
            onChange={(event) => setIsOpen(event.target.checked)}
            className="accent-blueprint-accent"
          />
          Members can self-join
        </label>
      </div>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {isPending ? "Creating…" : "Create challenge"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-blueprint-accent">Created.</p>}
      </div>
    </form>
  );
}
