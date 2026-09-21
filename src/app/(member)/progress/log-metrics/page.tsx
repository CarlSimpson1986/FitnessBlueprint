import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { BodyMetricsForm } from "../BodyMetricsForm";

export default async function LogMetricsPage() {
  await requireProfile();

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link href="/progress" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
          ← Progress
        </Link>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-6">Update measurements</h1>
        <BodyMetricsForm />
      </div>
    </main>
  );
}
