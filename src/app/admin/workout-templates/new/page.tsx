import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { TemplateEditor } from "../TemplateEditor";

export default async function NewWorkoutTemplatePage() {
  await requireOwner();

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
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-8">New template</h1>

        <TemplateEditor initialName="" initialSegments={[]} />
      </div>
    </main>
  );
}
