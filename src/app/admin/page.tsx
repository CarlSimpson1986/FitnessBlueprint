import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { signOut } from "@/app/(member)/account/actions";
import { TestAccountSwitcher } from "@/components/TestAccountSwitcher";
import { DEMO_EMAIL_PATTERN } from "@/lib/demo-data";
import { DemoDataCard } from "./demo-data/DemoDataCard";
import { EmailCheckCard } from "./email-check/EmailCheckCard";

export default async function AdminPage() {
  const { supabase, profile } = await requireCoachOrOwner();
  const { count: demoProfileCount } =
    profile.role === "owner"
      ? await supabase.from("profiles").select("id", { count: "exact", head: true }).like("email", DEMO_EMAIL_PATTERN)
      : { count: 0 };
  const demoLoaded = (demoProfileCount ?? 0) > 0;

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <p className="fb-eyebrow">Admin</p>
          <div className="flex items-center gap-4">
            <Link
              href="/account/settings"
              className="text-xs text-blueprint-muted hover:text-blueprint-accent transition"
            >
              Account settings
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-xs text-blueprint-muted hover:text-red-400 transition">
                Sign out
              </button>
            </form>
          </div>
        </div>
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

          {profile.role === "owner" && (
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
          )}

          <Link
            href="/admin/check-ins"
            className="block border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-5 hover:border-blueprint-accent transition"
          >
            <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-2">
              Weekly check-ins
            </p>
            <p className="text-blueprint-muted text-sm leading-relaxed">
              How members&apos; weeks went — ratings, wins, struggles, notes for the coach.
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
              {profile.role === "owner"
                ? "Classes, scheduling, and templates — everything for the timetable in one place."
                : "The whole programme, view-only — open your sessions to see the workout and who's coming."}
            </p>
          </Link>

          {profile.role === "owner" && (
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
          )}

          {profile.role === "owner" && (
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
          )}

          {profile.role === "owner" && <TestAccountSwitcher />}

          {profile.role === "owner" && <DemoDataCard loaded={demoLoaded} />}

          {profile.role === "owner" && <EmailCheckCard />}

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
