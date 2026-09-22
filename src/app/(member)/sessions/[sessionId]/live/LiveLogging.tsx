"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SEGMENT_TYPE_ACCENT, SEGMENT_TYPE_LABEL, type MetricType, type SegmentType } from "@/lib/workout-content";
import { finishWorkout, logExerciseSet } from "./actions";

export type LiveSet = {
  id: string;
  setNumber: number;
  target: string | null;
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
  distanceM: number | null;
  // Reference only, computed from the member's own logged history —
  // never auto-filled into the inputs below, they always type their own.
  lastWeightKg: number | null;
  lastReps: number | null;
  suggestedKg: number | null;
  suggestionBasis: string | null;
};

export type LiveExercise = {
  id: string;
  name: string;
  metricType: MetricType;
  eachSide: boolean;
  sets: LiveSet[];
};

export type LiveSegment = {
  id: string;
  type: SegmentType;
  label: string | null;
  exercises: LiveExercise[];
};

function isSetLogged(set: LiveSet, metricType: MetricType): boolean {
  switch (metricType) {
    case "weight_kg":
      return set.weightKg !== null;
    case "weight_kg_and_reps":
      return set.weightKg !== null && set.reps !== null;
    case "reps_only":
      return set.reps !== null;
    case "time_seconds":
      return set.timeSeconds !== null;
    case "distance_m":
      return set.distanceM !== null;
  }
}

function isExerciseComplete(exercise: LiveExercise): boolean {
  return exercise.sets.length > 0 && exercise.sets.every((s) => isSetLogged(s, exercise.metricType));
}

function isSegmentComplete(segment: LiveSegment): boolean {
  return segment.exercises.length > 0 && segment.exercises.every(isExerciseComplete);
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

type SetPatch = Partial<Pick<LiveSet, "weightKg" | "reps" | "timeSeconds" | "distanceM">>;

function SetRow({ set, metricType, onSave }: { set: LiveSet; metricType: MetricType; onSave: (patch: SetPatch) => void }) {
  const [weight, setWeight] = useState(set.weightKg?.toString() ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [time, setTime] = useState(set.timeSeconds?.toString() ?? "");
  const [distance, setDistance] = useState(set.distanceM?.toString() ?? "");

  const fieldClass =
    "w-16 bg-blueprint-raised border border-blueprint-line rounded text-sm text-center text-blueprint-ink px-1 py-1.5 focus:outline-none focus:border-blueprint-accent";

  const showWeightHistory = metricType === "weight_kg" || metricType === "weight_kg_and_reps";

  return (
    <div className="space-y-0.5">
    <div className="flex items-center gap-2">
      <span className="text-xs text-blueprint-muted w-4">{set.setNumber}</span>
      {(metricType === "weight_kg" || metricType === "weight_kg_and_reps") && (
        <input
          type="number"
          inputMode="decimal"
          placeholder="kg"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => onSave({ weightKg: numberOrNull(weight) })}
          className={fieldClass}
        />
      )}
      {(metricType === "reps_only" || metricType === "weight_kg_and_reps") && (
        <input
          type="number"
          inputMode="numeric"
          placeholder="reps"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          onBlur={() => onSave({ reps: numberOrNull(reps) })}
          className={fieldClass}
        />
      )}
      {metricType === "time_seconds" && (
        <input
          type="number"
          inputMode="numeric"
          placeholder="sec"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => onSave({ timeSeconds: numberOrNull(time) })}
          className={fieldClass}
        />
      )}
      {metricType === "distance_m" && (
        <input
          type="number"
          inputMode="decimal"
          placeholder="m"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          onBlur={() => onSave({ distanceM: numberOrNull(distance) })}
          className={fieldClass}
        />
      )}
      {set.target && <span className="text-[10px] text-blueprint-muted">target: {set.target}</span>}
    </div>
      {showWeightHistory && (set.lastWeightKg !== null || set.suggestedKg !== null) && (
        <p className="text-[10px] text-blueprint-dim pl-6">
          {set.lastWeightKg !== null && (
            <>
              Last time: {set.lastWeightKg}kg{set.lastReps !== null ? ` × ${set.lastReps}` : ""}
            </>
          )}
          {set.suggestedKg !== null && (
            <>
              {set.lastWeightKg !== null ? " · " : ""}
              <span title={set.suggestionBasis ?? undefined}>Suggested ~{set.suggestedKg}kg</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ExerciseBlock({
  exercise,
  onSetSave,
}: {
  exercise: LiveExercise;
  onSetSave: (setId: string, patch: SetPatch) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-blueprint-ink font-medium">
          {exercise.name}
          {exercise.eachSide ? " (each side)" : ""}
        </span>
        <span className="text-[10px] text-blueprint-muted">{exercise.sets.length} sets</span>
      </div>
      <div className="space-y-1">
        {exercise.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            metricType={exercise.metricType}
            onSave={(patch) => onSetSave(set.id, patch)}
          />
        ))}
      </div>
    </div>
  );
}

function DoneRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-blueprint-muted">{label}</span>
      <svg
        className="text-blueprint-accent"
        style={{ width: 16, height: 16 }}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </div>
  );
}

export function LiveLogging({
  sessionId,
  className,
  coachName,
  initialSegments,
}: {
  sessionId: string;
  className: string;
  coachName: string;
  initialSegments: LiveSegment[];
}) {
  const router = useRouter();
  const [segments, setSegments] = useState(initialSegments);
  const [isPending, startTransition] = useTransition();
  const [finishError, setFinishError] = useState<string | null>(null);

  function handleSetSave(setId: string, exerciseId: string, patch: SetPatch) {
    setSegments((prev) =>
      prev.map((seg) => ({
        ...seg,
        exercises: seg.exercises.map((ex) =>
          ex.id !== exerciseId
            ? ex
            : { ...ex, sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }
        ),
      }))
    );

    startTransition(async () => {
      await logExerciseSet({
        setId,
        exerciseId,
        weightKg: patch.weightKg ?? null,
        reps: patch.reps ?? null,
        timeSeconds: patch.timeSeconds ?? null,
        distanceM: patch.distanceM ?? null,
      });
    });
  }

  function handleFinish() {
    setFinishError(null);
    startTransition(async () => {
      const result = await finishWorkout(sessionId);
      if (result.error) {
        setFinishError(result.error);
        return;
      }
      router.push(`/sessions/${sessionId}/finish`);
    });
  }

  // Determine how far through the segment list the member has reached:
  // everything before the first incomplete segment renders collapsed
  // (done), that first incomplete segment renders fully, everything after
  // it is just previewed by name.
  const activeSegmentIndex = segments.findIndex((s) => !isSegmentComplete(s));
  const reachedIndex = activeSegmentIndex === -1 ? segments.length : activeSegmentIndex;

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Link href="/" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
            ← Home
          </Link>
        </div>
        <p className="fb-eyebrow mb-1">with {coachName}</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-6">{className}</h1>

        <div className="space-y-4">
          {segments.map((segment, segIndex) => {
            if (segIndex > reachedIndex) {
              return (
                <p key={segment.id} className="text-xs text-blueprint-dim">
                  {segment.label || SEGMENT_TYPE_LABEL[segment.type]}
                </p>
              );
            }

            if (segIndex < reachedIndex) {
              return (
                <div key={segment.id} className="fb-card">
                  <DoneRow label={segment.label || SEGMENT_TYPE_LABEL[segment.type]} />
                </div>
              );
            }

            // The active segment.
            const isCircuit = segment.type === "circuit";
            const exerciseActiveIndex = segment.exercises.findIndex((e) => !isExerciseComplete(e));
            const exerciseReachedIndex =
              exerciseActiveIndex === -1 ? segment.exercises.length : exerciseActiveIndex;

            return (
              <div
                key={segment.id}
                className="rounded overflow-hidden border border-blueprint-line"
                style={{ borderTop: `3px solid ${SEGMENT_TYPE_ACCENT[segment.type]}` }}
              >
                <div className="bg-blueprint-raised/60 px-4 py-2">
                  <p className="text-xs text-blueprint-muted">
                    {segment.label || SEGMENT_TYPE_LABEL[segment.type]}
                    {isCircuit ? " · repeat as shown · log as you go" : ""}
                  </p>
                </div>
                <div className="p-3 space-y-3">
                  {isCircuit
                    ? segment.exercises.map((exercise) => (
                        <ExerciseBlock
                          key={exercise.id}
                          exercise={exercise}
                          onSetSave={(setId, patch) => handleSetSave(setId, exercise.id, patch)}
                        />
                      ))
                    : segment.exercises.map((exercise, exIndex) => {
                        if (exIndex > exerciseReachedIndex) return null;
                        if (exIndex < exerciseReachedIndex) {
                          return <DoneRow key={exercise.id} label={exercise.name} />;
                        }
                        return (
                          <ExerciseBlock
                            key={exercise.id}
                            exercise={exercise}
                            onSetSave={(setId, patch) => handleSetSave(setId, exercise.id, patch)}
                          />
                        );
                      })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleFinish}
          disabled={isPending}
          className="fb-btn-primary w-full mt-6"
        >
          {isPending ? "…" : "Finish workout"}
        </button>
        {finishError && <p className="text-sm text-red-400 mt-2">{finishError}</p>}
      </div>
    </main>
  );
}
