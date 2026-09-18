import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";

export default async function AdminPage() {
  const { profile } = await requireCoachOrOwner();

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="fb-eyebrow mb-1">
          Admin
        </p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-10">
          {profile.role === "owner" ? "Everything, in one place" : "Coach tools"}
        </h1>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/sessions"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Sessions
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              Schedule the timetable, cancel sessions, browse day by day.
            </p>
          </Link>

          {profile.role === "owner" && (
            <Link
              href="/admin/members"
              className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
            >
              <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
                Members
              </p>
              <p className="text-blueprint-muted text-sm leading-relaxed">
                Assign plans, create accounts, reset passwords.
              </p>
            </Link>
          )}

          {profile.role === "owner" && (
            <Link
              href="/owner/feedback"
              className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
            >
              <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
                Feedback
              </p>
              <p className="text-blueprint-muted text-sm leading-relaxed">
                Member session ratings — private to you.
              </p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
