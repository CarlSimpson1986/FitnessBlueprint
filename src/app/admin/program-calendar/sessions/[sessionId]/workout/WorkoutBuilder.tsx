"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentExerciseEditor } from "@/components/SegmentExerciseEditor";
import type { SegmentDraft, SegmentInput } from "@/lib/workout-content";
import { ScopePicker } from "../../../ScopePicker";
import type { SeriesScope } from "../../../schedule-actions";
import { copyWorkoutForward, copyWorkoutSameDay, saveSessionWorkout } from "./actions";

export type { SegmentDraft };

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "es"}`;
}

export function WorkoutBuilder({
  sessionId,
  sessionDate,
  time,
  className,
  sameDayTimes,
  initialSegments,
  previewTitle,
}: {
  sessionId: string;
  sessionDate: string;
  time: string;
  className: string;
  /** Start times of the other classes of this type on the same date. */
  sameDayTimes: string[];
  initialSegments: SegmentDraft[];
  previewTitle?: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<SeriesScope>("one");
  const [sameDay, setSameDay] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const weekday = new Date(`${sessionDate}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long" });

  async function handleSave(segments: SegmentInput[]) {
    setNotice(null);
    const result = await saveSessionWorkout(sessionId, segments);
    if (result.error) {
      return result;
    }

    const notes: string[] = [];
    // "And every later" runs from this class and from each same-day class
    // it was copied to, so one save can fill every Monday class for the year.
    const sources = [sessionId];

    if (sameDay && sameDayTimes.length > 0) {
      const day = await copyWorkoutSameDay(sessionId);
      if (day.error) {
        return { error: `Saved this class, but not the other ${weekday} classes: ${day.error}` };
      }
      sources.push(...(day.copiedIds ?? []));
      notes.push(
        `Also saved to ${plural(day.copied ?? 0, "class")} this ${weekday}` +
          (day.kept ? ` · ${day.kept} kept (members already logged them)` : "")
      );
    }

    if (scope === "following") {
      let copied = 0;
      let kept = 0;
      for (const source of sources) {
        const forward = await copyWorkoutForward(source);
        if (forward.error) {
          return { error: `Saved, but not to every later ${weekday}: ${forward.error}` };
        }
        copied += forward.copied ?? 0;
        kept += forward.kept ?? 0;
      }
      notes.push(
        `Also saved to ${plural(copied, "later class")}` +
          (kept ? ` · ${kept} kept (members already logged them)` : "")
      );
    }

    setNotice(notes.length > 0 ? notes.join(". ") : null);
    router.refresh();
    return result;
  }

  return (
    <div className="space-y-4">
      <div className="fb-card !py-3 max-w-md">
        <p className="fb-eyebrow mb-2">Save to</p>
        <ScopePicker name="workout-scope" dateKey={sessionDate} time={time} value={scope} onChange={setScope} />
        {sameDayTimes.length > 0 && (
          <label className="flex items-start gap-1.5 text-[10px] text-blueprint-ink mt-2 pt-2 border-t border-blueprint-line">
            <input
              type="checkbox"
              checked={sameDay}
              onChange={(e) => setSameDay(e.target.checked)}
              className="mt-0.5 accent-blueprint-accent"
            />
            <span>
              Also every other {className} class this {weekday} ({sameDayTimes.join(", ")})
              {scope === "following" ? `, and every later ${weekday} at those times` : ""}
            </span>
          </label>
        )}
        {notice && <p className="text-xs text-blueprint-accent mt-2">{notice}</p>}
      </div>
      <SegmentExerciseEditor
        initialSegments={initialSegments}
        onSave={handleSave}
        saveLabel={scope === "one" && !sameDay ? "Save workout" : "Save to all of them"}
        previewTitle={previewTitle}
      />
    </div>
  );
}
