"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleHabit } from "./habit-actions";

type Habit = {
  id: string;
  name: string;
  isCompleted: boolean;
};

export function HabitChecklist({ habits }: { habits: Habit[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function handleToggle(habit: Habit) {
    setError(null);
    setPendingId(habit.id);
    startTransition(async () => {
      const result = await toggleHabit(habit.id, habit.isCompleted);
      if (result.error) {
        setError(result.error);
      } else {
        startTransition(() => {
          router.refresh();
        });
      }
      setPendingId(null);
    });
  }

  const completedCount = habits.filter((h) => h.isCompleted).length;

  return (
    <div className="fb-card">
      <div className="flex items-center justify-between mb-3">
        <p className="text-blueprint-ink font-medium text-sm">Daily habits</p>
        <span className="text-blueprint-muted text-xs">
          {completedCount}/{habits.length}
        </span>
      </div>
      <ul className="space-y-2">
        {habits.map((habit) => (
          <li key={habit.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={habit.isCompleted}
              disabled={isPending && pendingId === habit.id}
              onChange={() => handleToggle(habit)}
              className="w-[18px] h-[18px] accent-blueprint-accent"
            />
            <span
              className={
                habit.isCompleted
                  ? "text-sm text-blueprint-dim line-through"
                  : "text-sm text-blueprint-ink"
              }
            >
              {habit.name}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
