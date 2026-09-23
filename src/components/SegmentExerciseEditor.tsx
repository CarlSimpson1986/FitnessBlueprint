"use client";

import { useRef, useState, useTransition } from "react";
import { MemberWorkoutPreview } from "@/components/MemberWorkoutPreview";
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
  type IntensityType,
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
 * Shared block-builder UI for both the per-session workout
 * (src/app/admin/program-calendar/sessions/[sessionId]/workout) and the
 * reusable template library (src/app/admin/workout-templates) — same
 * segments/exercises shape, different save target, passed in via onSave.
 * Segments render as a single top-to-bottom sequential list, not a grid —
 * they ARE a sequence (warmup → circuit → finisher), so a wrapping
 * multi-column layout broke that reading order. Exercises collapse to a
 * compact header (name + set count) and expand on click, so a 6-exercise
 * circuit doesn't mean scrolling through 6 fully-open set editors at once.
 * Each exercise is a list of individual sets, each with its own
 * target/rest, added one at a time — matches the Everfit-style reference
 * the owner asked to match (0020), rather than one shared rounds count.
 */
export function SegmentExerciseEditor({
  initialSegments,
  onSave,
  saveLabel = "Save workout",
  previewTitle,
}: {
  initialSegments: SegmentDraft[];
  onSave: (segments: SegmentInput[]) => Promise<{ error?: string }>;
  saveLabel?: string;
  previewTitle?: string;
}) {
  const [segments, setSegments] = useState<SegmentDraft[]>(
    initialSegments.length > 0 ? initialSegments : [newSegmentDraft()]
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Collapsed by default (existing content), expanded on click or right
  // after adding — tracked by exercise key so it survives reorders.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  // "+ Add segment" appends to the end of a list that can already be long
  // — with no scroll, a new segment landing below the fold looked like the
  // button did nothing. Scrolled into view the moment its DOM node mounts.
  const justAddedSegmentKey = useRef<string | null>(null);

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

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
    <div className="flex gap-6 items-start">
      <div className="space-y-5 flex-1 min-w-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const fresh = newSegmentDraft();
            justAddedSegmentKey.current = fresh.key;
            setSegments((prev) => [...prev, fresh]);
          }}
          className="fb-btn-secondary"
        >
          + Add segment
        </button>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent border border-blueprint-line rounded px-3 py-1.5"
        >
          {showPreview ? "Hide" : "Preview as member"}
        </button>
      </div>

      <div className="space-y-5 max-w-2xl">
        {segments.map((segment, segIndex) => (
          <div
            key={segment.key}
            ref={(el) => {
              if (el && justAddedSegmentKey.current === segment.key) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                justAddedSegmentKey.current = null;
              }
            }}
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
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => moveSegment(segIndex, -1)}
                  disabled={segIndex === 0}
                  className="text-[10px] text-blueprint-muted hover:text-blueprint-accent disabled:opacity-30"
                  aria-label="Move segment up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSegment(segIndex, 1)}
                  disabled={segIndex === segments.length - 1}
                  className="text-[10px] text-blueprint-muted hover:text-blueprint-accent disabled:opacity-30"
                  aria-label="Move segment down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeSegment(segIndex)}
                  className="text-[10px] text-blueprint-muted hover:text-red-400"
                  aria-label="Remove segment"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="bg-blueprint-raised/40 p-3 space-y-2">
              {segment.exercises.map((exercise, exIndex) => {
                const isExpanded = expandedKeys.has(exercise.key);
                return (
                  <div key={exercise.key} className="fb-card">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(exercise.key)}
                      className="w-full flex items-center justify-between gap-2 text-left"
                    >
                      <span className="text-sm text-blueprint-ink truncate">
                        {exercise.name.trim() || "Untitled exercise"}
                      </span>
                      <span className="text-xs text-blueprint-muted shrink-0">
                        {exercise.sets.length} set{exercise.sets.length === 1 ? "" : "s"}{" "}
                        <span className="inline-block ml-1">{isExpanded ? "▾" : "▸"}</span>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="space-y-2 mt-3">
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
                          <div className="grid grid-cols-[2rem_1fr_1.3fr_4.5rem_1.5rem] gap-1.5 text-[10px] font-mono uppercase tracking-wide text-blueprint-muted px-0.5">
                            <span>Set</span>
                            <span>Target</span>
                            <span>%1RM / RPE</span>
                            <span>Rest, sec</span>
                            <span />
                          </div>
                          {exercise.sets.map((set, setIndex) => (
                            <div key={set.key} className="grid grid-cols-[2rem_1fr_1.3fr_4.5rem_1.5rem] gap-1.5 items-center">
                              <span className="text-xs text-blueprint-muted text-center">{setIndex + 1}</span>
                              <input
                                className={inputClass()}
                                placeholder="e.g. 12 reps"
                                value={set.target}
                                onChange={(e) => updateSet(segIndex, exIndex, setIndex, { target: e.target.value })}
                              />
                              <div className="flex gap-1 min-w-0">
                                <select
                                  className={inputClass() + " w-[4.25rem] shrink-0 px-1"}
                                  value={set.intensityType ?? ""}
                                  onChange={(e) => {
                                    const type = (e.target.value || null) as IntensityType | null;
                                    updateSet(segIndex, exIndex, setIndex, {
                                      intensityType: type,
                                      intensityValue: type ? set.intensityValue : null,
                                    });
                                  }}
                                  aria-label="Intensity type"
                                >
                                  <option value="">—</option>
                                  <option value="percent_1rm">%1RM</option>
                                  <option value="rpe">RPE</option>
                                </select>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step={set.intensityType === "rpe" ? 0.5 : 2.5}
                                  min={set.intensityType === "rpe" ? 1 : 0}
                                  max={set.intensityType === "rpe" ? 10 : 100}
                                  disabled={!set.intensityType}
                                  className={inputClass() + " min-w-0 disabled:opacity-40"}
                                  placeholder={set.intensityType === "rpe" ? "8" : set.intensityType ? "70" : ""}
                                  value={set.intensityValue ?? ""}
                                  onChange={(e) =>
                                    updateSet(segIndex, exIndex, setIndex, { intensityValue: numberOrNull(e.target.value) })
                                  }
                                  aria-label="Intensity value"
                                />
                              </div>
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
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  const fresh = newExerciseDraft();
                  updateSegment(segIndex, { exercises: [...segment.exercises, fresh] });
                  setExpandedKeys((prev) => new Set(prev).add(fresh.key));
                }}
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

      {showPreview && <MemberWorkoutPreview title={previewTitle ?? ""} segments={segments} />}
    </div>
  );
}
