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
            href="/admin/today"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Today
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              Mark attendance and see readiness for today&apos;s sessions.
            </p>
          </Link>

          <Link
            href="/admin/workout-templates"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Workout templates
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              Build a workout once, reuse it across sessions.
            </p>
          </Link>

          <Link
            href="/admin/program-calendar"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Program calendar
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              Classes, scheduling, and templates — everything for the
              timetable in one place.
            </p>
          </Link>

          <Link
            href="/admin/challenges"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Challenges
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              Run attendance, habit, or event-prep challenges.
            </p>
          </Link>

          <Link
            href="/admin/events"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Events
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              Post races, socials, and other gym events.
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

          {profile.role === "owner" && (
            <Link
              href="/owner/conversions"
              className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
            >
              <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
                6-week conversions
              </p>
              <p className="text-blueprint-muted text-sm leading-relaxed">
                Programme members who haven&apos;t converted yet.
              </p>
            </Link>
          )}

          {profile.role === "owner" && (
            <Link
              href="/owner/income"
              className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
            >
              <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
                Income
              </p>
              <p className="text-blueprint-muted text-sm leading-relaxed">
                Stripe + GoCardless totals, read-only.
              </p>
            </Link>
          )}

          {profile.role === "owner" && (
            <Link
              href="/owner/session-economics"
              className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
            >
              <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
                Session economics
              </p>
              <p className="text-blueprint-muted text-sm leading-relaxed">
                Fill rate and no-show rate, per coach.
              </p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
