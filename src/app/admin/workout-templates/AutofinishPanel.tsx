"use client";

import { useState, useTransition } from "react";
import { SegmentExerciseEditor } from "@/components/SegmentExerciseEditor";
import type { SegmentDraft, SegmentInput } from "@/lib/workout-content";
import { generateProgressionWeeks, approveGeneratedWeek } from "./autofinish-actions";

type ClassOption = { id: string; name: string };

function toDraftSet(set: SegmentInput["exercises"][number]["sets"][number]) {
  return { key: crypto.randomUUID(), target: set.target ?? "", restSeconds: set.restSeconds };
}

function toDraftExercise(exercise: SegmentInput["exercises"][number]) {
  return {
    key: crypto.randomUUID(),
    name: exercise.name,
    metricType: exercise.metricType,
    eachSide: exercise.eachSide,
    tempo: exercise.tempo ?? "",
    note: exercise.note ?? "",
    videoUrl: exercise.videoUrl ?? "",
    sets: exercise.sets.map(toDraftSet),
  };
}

/** Generated weeks come back as SegmentInput[][] — the editor needs SegmentDraft[]. */
function segmentsToDrafts(segments: SegmentInput[]): SegmentDraft[] {
  return segments.map((segment) => ({
    key: crypto.randomUUID(),
    type: segment.type,
    label: segment.label ?? "",
    defaultRounds: segment.defaultRounds,
    exercises: segment.exercises.map(toDraftExercise),
  }));
}

function addWeeks(dateKey: string, weeks: number) {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function GeneratedWeekCard({
  weekNumber,
  segments,
  defaultName,
  classTypeId,
  weekStartDate,
}: {
  weekNumber: number;
  segments: SegmentInput[];
  defaultName: string;
  classTypeId: string;
  weekStartDate: string;
}) {
  const [name, setName] = useState(defaultName);
  const [assignedCount, setAssignedCount] = useState<number | null>(null);

  async function handleApprove(currentSegments: SegmentInput[]) {
    setAssignedCount(null);
    const result = await approveGeneratedWeek(name, currentSegments, classTypeId, weekStartDate);
    if (!result.error) {
      setAssignedCount(result.assignedCount ?? 0);
    }
    return { error: result.error };
  }

  return (
    <div className="border border-blueprint-line rounded p-4">
      <p className="fb-eyebrow mb-2">Week {weekNumber}</p>
      <input
        className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-3 py-2 mb-4 focus:outline-none focus:border-blueprint-accent"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <SegmentExerciseEditor
        initialSegments={segmentsToDrafts(segments)}
        onSave={handleApprove}
        saveLabel="Approve & assign"
      />
      {assignedCount !== null && (
        <p className="text-sm text-blueprint-accent mt-2">
          Assigned to {assignedCount} session{assignedCount === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}

export function AutofinishPanel({
  templateId,
  templateName,
  classes,
}: {
  templateId: string;
  templateName: string;
  classes: ClassOption[];
}) {
  const [open, setOpen] = useState(false);
  const [weekCount, setWeekCount] = useState(6);
  const [classTypeId, setClassTypeId] = useState(classes[0]?.id ?? "");
  const [blockStart, setBlockStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [instruction, setInstruction] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generatedWeeks, setGeneratedWeeks] = useState<SegmentInput[][] | null>(null);

  function handleGenerate() {
    setError(null);
    setGeneratedWeeks(null);
    startTransition(async () => {
      const result = await generateProgressionWeeks(templateId, weekCount, instruction);
      if (result.error) {
        setError(result.error);
        return;
      }
      setGeneratedWeeks(result.weeks ?? []);
    });
  }

  if (classes.length === 0) {
    return null;
  }

  return (
    <div className="border border-blueprint-line/60 rounded p-4 mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-medium text-blueprint-ink flex items-center gap-2"
      >
        Autofinish with AI {open ? "▾" : "▸"}
      </button>

      {open && (
        <div className="mt-4 space-y-4 max-w-xl">
          <p className="text-xs text-blueprint-muted leading-relaxed">
            Uses this template as week 1&apos;s blueprint and generates the rest of the block from your
            instruction — never a member-specific weight, only structural progression (sets, rest,
            exercise choice, and the target text itself, e.g. &ldquo;70% 1RM x5&rdquo; → &ldquo;72.5% 1RM x5&rdquo;). Nothing
            is saved until you approve each generated week below.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wide text-blueprint-muted mb-1">
                Block length (weeks)
              </label>
              <input
                type="number"
                min={2}
                max={12}
                value={weekCount}
                onChange={(e) => setWeekCount(Number(e.target.value))}
                className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-3 py-2 focus:outline-none focus:border-blueprint-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wide text-blueprint-muted mb-1">
                Week 1 starts (Monday)
              </label>
              <input
                type="date"
                value={blockStart}
                onChange={(e) => setBlockStart(e.target.value)}
                className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-3 py-2 focus:outline-none focus:border-blueprint-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wide text-blueprint-muted mb-1">
              Class (matches generated weeks onto that class&apos;s scheduled sessions)
            </label>
            <select
              value={classTypeId}
              onChange={(e) => setClassTypeId(e.target.value)}
              className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-3 py-2 focus:outline-none focus:border-blueprint-accent"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wide text-blueprint-muted mb-1">
              How should this block progress?
            </label>
            <textarea
              rows={3}
              placeholder="e.g. “add a 4th set each week, don't touch week 4 — that's a deload”"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-3 py-2 focus:outline-none focus:border-blueprint-accent"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="fb-btn-primary disabled:opacity-50"
          >
            {isPending ? "Generating…" : `Generate weeks 2-${weekCount}`}
          </button>

          {generatedWeeks && generatedWeeks.length > 0 && (
            <div className="space-y-6 mt-6">
              {generatedWeeks.map((segments, i) => (
                <GeneratedWeekCard
                  key={i}
                  weekNumber={i + 2}
                  segments={segments}
                  defaultName={`${templateName} — Week ${i + 2}`}
                  classTypeId={classTypeId}
                  weekStartDate={addWeeks(blockStart, i + 1)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
