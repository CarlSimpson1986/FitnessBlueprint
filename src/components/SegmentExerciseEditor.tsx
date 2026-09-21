"use client";

import { useState, useTransition } from "react";
import {
  draftsToInput,
  newExerciseDraft,
  newExerciseSetDraft,
  newSegmentDraft,
  METRIC_TYPE_LABEL,
  SEGMENT_TYPE_ACCENT,
  SEGMENT_TYPE_LABEL,
  type ExerciseDraft,
  type ExerciseSetDraft,
  type MetricType,
  type SegmentDraft,
  type SegmentInput,
  type SegmentType,
} from "@/lib/workout-content";

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inputClass() {
  return "w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-2 py-1.5 focus:outline-none focus:border-blueprint-accent";
}

/**
 * Shared block-builder UI for both the per-session workout (src/app/admin/
 * sessions/[sessionId]/workout) and the reusable template library (src/app/
 * admin/workout-templates) — same segments/exercises shape, different save
 * target, passed in via onSave. Laid out as a wide multi-column grid of
 * "block" cards with a coloured header bar per segment type (desktop-first —
 * this is a coach building on a laptop, not the mobile member PWA). Each
 * exercise is a list of individual sets, each with its own target/rest,
 * added one at a time — matches the Everfit-style reference the owner
 * asked to match (0020), rather than one shared rounds count.
 */
export function SegmentExerciseEditor({
  initialSegments,
  onSave,
  saveLabel = "Save workout",
}: {
  initialSegments: SegmentDraft[];
  onSave: (segments: SegmentInput[]) => Promise<{ error?: string }>;
  saveLabel?: string;
}) {
  const [segments, setSegments] = useState<SegmentDraft[]>(
    initialSegments.length > 0 ? initialSegments : [newSegmentDraft()]
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateSegment(index: number, patch: Partial<SegmentDraft>) {
    setSaved(false);
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateExercise(segIndex: number, exIndex: number, patch: Partial<ExerciseDraft>) {
    setSaved(false);
    setSegments((prev) =>
      prev.map((s, i) =>
        i !== segIndex
          ? s
          : { ...s, exercises: s.exercises.map((e, j) => (j === exIndex ? { ...e, ...patch } : e)) }
      )
    );
  }

  function updateSet(segIndex: number, exIndex: number, setIndex: number, patch: Partial<ExerciseSetDraft>) {
    setSaved(false);
    setSegments((prev) =>
      prev.map((s, i) =>
        i !== segIndex
          ? s
          : {
              ...s,
              exercises: s.exercises.map((e, j) =>
                j !== exIndex
                  ? e
                  : { ...e, sets: e.sets.map((set, k) => (k === setIndex ? { ...set, ...patch } : set)) }
              ),
            }
      )
    );
  }

  function addSet(segIndex: number, exIndex: number) {
    setSaved(false);
    setSegments((prev) =>
      prev.map((s, i) =>
        i !== segIndex
          ? s
          : {
              ...s,
              exercises: s.exercises.map((e, j) =>
                j !== exIndex ? e : { ...e, sets: [...e.sets, newExerciseSetDraft()] }
              ),
            }
      )
    );
  }

  function removeSet(segIndex: number, exIndex: number, setIndex: number) {
    setSaved(false);
    setSegments((prev) =>
      prev.map((s, i) =>
        i !== segIndex
          ? s
          : {
              ...s,
              exercises: s.exercises.map((e, j) =>
                j !== exIndex ? e : { ...e, sets: e.sets.filter((_, k) => k !== setIndex) }
              ),
            }
      )
    );
  }

  function moveSegment(index: number, dir: -1 | 1) {
    setSaved(false);
    setSegments((prev) => {
      const next = prev.slice();
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      const temp = next[index]!;
      next[index] = next[target]!;
      next[target] = temp;
      return next;
    });
  }

  function removeSegment(index: number) {
    setSaved(false);
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  function removeExercise(segIndex: number, exIndex: number) {
    setSaved(false);
    setSegments((prev) =>
      prev.map((s, i) => (i !== segIndex ? s : { ...s, exercises: s.exercises.filter((_, j) => j !== exIndex) }))
    );
  }

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSave(draftsToInput(segments));

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(true);
    });
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setSegments((prev) => [...prev, newSegmentDraft()])}
        className="fb-btn-secondary"
      >
        + Add segment
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5 items-start">
        {segments.map((segment, segIndex) => (
          <div
            key={segment.key}
            className="rounded overflow-hidden border border-blueprint-line"
            style={{ borderTop: `3px solid ${SEGMENT_TYPE_ACCENT[segment.type]}` }}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 bg-blueprint-raised/60">
              <div className="flex-1 space-y-2">
                <select
                  className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm font-medium px-2 py-1.5 focus:outline-none"
                  style={{ color: SEGMENT_TYPE_ACCENT[segment.type] }}
                  value={segment.type}
                  onChange={(e) => updateSegment(segIndex, { type: e.target.value as SegmentType })}
                >
                  {(Object.keys(SEGMENT_TYPE_LABEL) as SegmentType[]).map((t) => (
                    <option key={t} value={t}>
                      {SEGMENT_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass()}
                  placeholder="Label (optional), e.g. Circuit A"
                  value={segment.label}
                  onChange={(e) => updateSegment(segIndex, { label: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => moveSegment(segIndex, -1)}
                  disabled={segIndex === 0}
                  className="text-xs text-blueprint-muted hover:text-blueprint-accent disabled:opacity-30"
                  aria-label="Move segment up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSegment(segIndex, 1)}
                  disabled={segIndex === segments.length - 1}
                  className="text-xs text-blueprint-muted hover:text-blueprint-accent disabled:opacity-30"
                  aria-label="Move segment down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeSegment(segIndex)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="bg-blueprint-raised/40 p-3 space-y-3">
              {segment.exercises.map((exercise, exIndex) => (
                <div key={exercise.key} className="fb-card space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      className={inputClass()}
                      placeholder="Exercise name, e.g. Deadlift"
                      value={exercise.name}
                      onChange={(e) => updateExercise(segIndex, exIndex, { name: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => removeExercise(segIndex, exIndex)}
                      disabled={segment.exercises.length === 1}
                      className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30 whitespace-nowrap pt-1.5"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className={inputClass()}
                      value={exercise.metricType}
                      onChange={(e) =>
                        updateExercise(segIndex, exIndex, { metricType: e.target.value as MetricType })
                      }
                    >
                      {(Object.keys(METRIC_TYPE_LABEL) as MetricType[]).map((m) => (
                        <option key={m} value={m}>
                          {METRIC_TYPE_LABEL[m]}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass()}
                      placeholder="Tempo (optional)"
                      value={exercise.tempo}
                      onChange={(e) => updateExercise(segIndex, exIndex, { tempo: e.target.value })}
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-blueprint-muted">
                    <input
                      type="checkbox"
                      checked={exercise.eachSide}
                      onChange={(e) => updateExercise(segIndex, exIndex, { eachSide: e.target.checked })}
                    />
                    Each side
                  </label>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-1.5 text-[10px] font-mono uppercase tracking-wide text-blueprint-muted px-0.5">
                      <span>Set</span>
                      <span>Target</span>
                      <span>Rest, sec</span>
                      <span />
                    </div>
                    {exercise.sets.map((set, setIndex) => (
                      <div key={set.key} className="grid grid-cols-[2rem_1fr_1fr_1.5rem] gap-1.5 items-center">
                        <span className="text-xs text-blueprint-muted text-center">{setIndex + 1}</span>
                        <input
                          className={inputClass()}
                          placeholder="e.g. 12 reps"
                          value={set.target}
                          onChange={(e) => updateSet(segIndex, exIndex, setIndex, { target: e.target.value })}
                        />
                        <input
                          type="number"
                          min={0}
                          className={inputClass()}
                          value={set.restSeconds ?? ""}
                          onChange={(e) =>
                            updateSet(segIndex, exIndex, setIndex, { restSeconds: numberOrNull(e.target.value) })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => removeSet(segIndex, exIndex, setIndex)}
                          disabled={exercise.sets.length === 1}
                          className="text-red-400 hover:text-red-300 disabled:opacity-30 text-xs"
                          aria-label="Remove set"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSet(segIndex, exIndex)}
                      className="text-[10px] font-mono uppercase tracking-wide text-blueprint-accent hover:opacity-80"
                    >
                      + Add set
                    </button>
                  </div>

                  <input
                    className={inputClass()}
                    placeholder="Video URL (optional)"
                    value={exercise.videoUrl}
                    onChange={(e) => updateExercise(segIndex, exIndex, { videoUrl: e.target.value })}
                  />
                  <textarea
                    className={inputClass()}
                    placeholder="Add note for this exercise…"
                    rows={2}
                    value={exercise.note}
                    onChange={(e) => updateExercise(segIndex, exIndex, { note: e.target.value })}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  updateSegment(segIndex, { exercises: [...segment.exercises, newExerciseDraft()] })
                }
                className="text-xs font-mono uppercase tracking-wide text-blueprint-accent hover:opacity-80"
              >
                + Add exercise
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button type="button" onClick={handleSave} disabled={isPending} className="fb-btn-primary px-8">
          {isPending ? "Saving…" : saveLabel}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && !error && <p className="text-sm text-blueprint-accent">Saved.</p>}
      </div>
    </div>
  );
}
