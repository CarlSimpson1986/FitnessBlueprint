import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCoachOrOwner } from "@/lib/auth";
import type { SegmentDraft } from "@/lib/workout-content";
import { TemplateEditor } from "../TemplateEditor";
import { AutofinishPanel } from "../AutofinishPanel";

export default async function EditWorkoutTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const { supabase } = await requireCoachOrOwner();

  const { data: template } = await supabase
    .from("workout_templates")
    .select("id, name")
    .eq("id", templateId)
    .maybeSingle();

  if (!template) {
    notFound();
  }

  const { data: activeClasses } = await supabase
    .from("session_templates")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: segments } = await supabase
    .from("template_segments")
    .select("id, type, label, default_rounds, sort_order")
    .eq("template_id", templateId)
    .order("sort_order");

  const segmentIds = (segments ?? []).map((s) => s.id);
  const { data: exercises } = await supabase
    .from("template_exercises")
    .select("id, segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order")
    .in("segment_id", segmentIds.length > 0 ? segmentIds : [""])
    .order("sort_order");

  const exerciseIds = (exercises ?? []).map((e) => e.id);
  const { data: sets } = await supabase
    .from("template_exercise_sets")
    .select("id, exercise_id, target, rest_seconds, sort_order")
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : [""])
    .order("sort_order");

  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets ?? []) {
    const list = setsByExercise.get(set.exercise_id) ?? [];
    list.push(set);
    setsByExercise.set(set.exercise_id, list);
  }

  const exercisesBySegment = new Map<string, typeof exercises>();
  for (const exercise of exercises ?? []) {
    const list = exercisesBySegment.get(exercise.segment_id) ?? [];
    list.push(exercise);
    exercisesBySegment.set(exercise.segment_id, list);
  }

  const initialSegments: SegmentDraft[] = (segments ?? []).map((segment) => ({
    key: segment.id,
    type: segment.type,
    label: segment.label ?? "",
    defaultRounds: segment.default_rounds,
    exercises: (exercisesBySegment.get(segment.id) ?? []).map((exercise) => ({
      key: exercise.id,
      name: exercise.name,
      metricType: exercise.metric_type,
      eachSide: exercise.each_side,
      tempo: exercise.tempo ?? "",
      note: exercise.note ?? "",
      videoUrl: exercise.video_url ?? "",
      sets: (setsByExercise.get(exercise.id) ?? []).map((set) => ({
        key: set.id,
        target: set.target ?? "",
        restSeconds: set.rest_seconds,
      })),
    })),
  }));

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/admin/workout-templates"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Workout templates
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-8">{template.name}</h1>

        <TemplateEditor templateId={template.id} initialName={template.name} initialSegments={initialSegments} />

        <AutofinishPanel templateId={template.id} templateName={template.name} classes={activeClasses ?? []} />
      </div>
    </main>
  );
}
