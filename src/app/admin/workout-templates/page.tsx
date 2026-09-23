import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

export default async function WorkoutTemplatesPage() {
  const { supabase } = await requireOwner();

  const { data: templates } = await supabase
    .from("workout_templates")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Workout templates</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Build a named workout once (e.g. &quot;Group Coaching 1&quot;), then assign it onto days in the{" "}
          <Link href="/admin/program-calendar" className="text-blueprint-accent hover:opacity-80">
            program calendar
          </Link>{" "}
          to see how a 6-week block looks.
        </p>

        <Link href="/admin/workout-templates/new" className="fb-btn-primary inline-block mb-8">
          + New template
        </Link>

        {(templates ?? []).length === 0 ? (
          <p className="text-blueprint-muted text-sm">No templates yet.</p>
        ) : (
          <ul className="space-y-2">
            {(templates ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-3"
              >
                <Link href={`/admin/workout-templates/${t.id}`} className="flex-1 text-blueprint-ink hover:text-blueprint-accent">
                  {t.name}
                </Link>
                <DeleteTemplateButton templateId={t.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
