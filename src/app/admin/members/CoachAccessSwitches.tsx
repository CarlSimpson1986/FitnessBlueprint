"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCoachArea } from "./actions";

type Area = { key: "today" | "programme" | "checkins"; label: string; hint: string };

/** Guy's on/off per coach for each area of the coach app (0042). Saves on each tap. */
export function CoachAccessSwitches({
  coachId,
  areas,
  initial,
}: {
  coachId: string;
  areas: readonly Area[];
  initial: Record<Area["key"], boolean>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [access, setAccess] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: Area["key"]) {
    const enabled = !access[key];
    setError(null);
    setAccess((prev) => ({ ...prev, [key]: enabled }));
    startTransition(async () => {
      try {
        const result = await setCoachArea(coachId, key, enabled);
        if (result.error) {
          setAccess((prev) => ({ ...prev, [key]: !enabled }));
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setAccess((prev) => ({ ...prev, [key]: !enabled }));
        setError("Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted mb-2">Can see</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {areas.map((area) => (
          <label key={area.key} className="flex items-center gap-2 text-xs text-blueprint-ink cursor-pointer" title={area.hint}>
            <input
              type="checkbox"
              checked={access[area.key]}
              onChange={() => toggle(area.key)}
              disabled={isPending}
              className="accent-blueprint-accent"
            />
            {area.label}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
