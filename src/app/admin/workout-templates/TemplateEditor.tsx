"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentExerciseEditor } from "@/components/SegmentExerciseEditor";
import type { SegmentDraft, SegmentInput } from "@/lib/workout-content";
import { saveWorkoutTemplate } from "./actions";

export function TemplateEditor({
  templateId,
  initialName,
  initialSegments,
}: {
  templateId?: string;
  initialName: string;
  initialSegments: SegmentDraft[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);

  async function handleSave(segments: SegmentInput[]) {
    if (!name.trim()) {
      setNameError("Name this template.");
      return { error: "Name this template." };
    }
    setNameError(null);

    const result = await saveWorkoutTemplate(name, segments, templateId);
    if (!result.error && !templateId && result.templateId) {
      router.replace(`/admin/workout-templates/${result.templateId}`);
    } else if (!result.error) {
      router.refresh();
    }
    return result;
  }

  return (
    <div className="space-y-6">
      <div className="max-w-sm">
        <label className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">
          Template name
        </label>
        <input
          className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-3 py-2 focus:outline-none focus:border-blueprint-accent"
          placeholder="e.g. Group Coaching 1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
      </div>

      <SegmentExerciseEditor initialSegments={initialSegments} onSave={handleSave} saveLabel="Save template" />
    </div>
  );
}
