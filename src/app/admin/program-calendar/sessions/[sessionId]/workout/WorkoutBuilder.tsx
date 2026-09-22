"use client";

import { useRouter } from "next/navigation";
import { SegmentExerciseEditor } from "@/components/SegmentExerciseEditor";
import type { SegmentDraft, SegmentInput } from "@/lib/workout-content";
import { saveSessionWorkout } from "./actions";

export type { SegmentDraft };

export function WorkoutBuilder({
  sessionId,
  initialSegments,
}: {
  sessionId: string;
  initialSegments: SegmentDraft[];
}) {
  const router = useRouter();

  async function handleSave(segments: SegmentInput[]) {
    const result = await saveSessionWorkout(sessionId, segments);
    if (!result.error) {
      router.refresh();
    }
    return result;
  }

  return <SegmentExerciseEditor initialSegments={initialSegments} onSave={handleSave} saveLabel="Save workout" />;
}
