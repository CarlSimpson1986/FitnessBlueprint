import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { BulkUploadForm } from "./BulkUploadForm";

export default async function SessionPlansPage() {
  const { supabase } = await requireCoachOrOwner();

  const { data: templates } = await supabase
    .from("session_templates")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Session plans</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Paste a whole training block at once — each day&apos;s plan is matched to the
          already-scheduled session of that type on that date and published straight away.
          Members and coaches see today&apos;s plan on the session itself.
        </p>

        <BulkUploadForm templates={templates ?? []} />
      </div>
    </main>
  );
}
