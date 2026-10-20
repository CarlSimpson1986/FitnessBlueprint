"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentExerciseEditor } from "@/components/SegmentExerciseEditor";
import type { SegmentDraft, SegmentInput } from "@/lib/workout-content";
import { ScopePicker } from "../../../ScopePicker";
import type { SeriesScope } from "../../../schedule-actions";
import { copyWorkoutForward, saveSessionWorkout } from "./actions";

export type { SegmentDraft };

export function WorkoutBuilder({
  sessionId,
  sessionDate,
  time,
  initialSegments,
  previewTitle,
}: {
  sessionId: string;
  sessionDate: string;
  time: string;
  initialSegments: SegmentDraft[];
  previewTitle?: string;
}) {
  const router = useRouter();
  const [scope, setScope] = useState<SeriesScope>("one");
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSave(segments: SegmentInput[]) {
    setNotice(null);
    const result = await saveSessionWorkout(sessionId, segments);
    if (result.error) {
      return result;
    }

    if (scope === "following") {
      const forward = await copyWorkoutForward(sessionId);
      if (forward.error) {
        return { error: `Saved this class, but not the later ones: ${forward.error}` };
      }
      setNotice(
        `Also saved to ${forward.copied} later class${forward.copied === 1 ? "" : "es"}` +
          (forward.kept ? ` · ${forward.kept} kept (members already logged them)` : "")
      );
    }

    router.refresh();
    return result;
  }

  return (
    <div className="space-y-4">
      <div className="fb-card !py-3 max-w-md">
        <p className="fb-eyebrow mb-2">Save to</p>
        <ScopePicker name="workout-scope" dateKey={sessionDate} time={time} value={scope} onChange={setScope} />
        {notice && <p className="text-xs text-blueprint-accent mt-2">{notice}</p>}
      </div>
      <SegmentExerciseEditor
        initialSegments={initialSegments}
        onSave={handleSave}
        saveLabel={scope === "one" ? "Save workout" : "Save to all of them"}
        previewTitle={previewTitle}
      />
    </div>
  );
}
