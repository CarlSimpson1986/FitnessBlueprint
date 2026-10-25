import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { type SegmentDraft } from "@/lib/workout-content";
import { loadWorkoutDrafts } from "@/lib/workout-store";
import { TemplateEditor } from "../TemplateEditor";
import { AutofinishPanel } from "../AutofinishPanel";

export default async function EditWorkoutTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const { templateId } = await params;
  const { supabase } = await requireOwner();

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

  const initialSegments: SegmentDraft[] = await loadWorkoutDrafts(supabase, "template", templateId);

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
