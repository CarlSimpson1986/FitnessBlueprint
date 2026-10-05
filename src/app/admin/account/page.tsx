import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { SetPasswordForm } from "@/app/(member)/account/SetPasswordForm";
import { CalendarFeedCard } from "@/app/(member)/account/settings/CalendarFeedCard";

/**
 * Account settings for coaches and the owner. The member page
 * (/account/settings) sits in the member layout — bottom tabs, health
 * info, "← Profile" — which made no sense for Guy (walkthrough,
 * 2026-10-05), so staff are sent here instead. Not one of the switchable
 * coach areas (0042): it's only their own password and calendar link.
 */
export default async function StaffAccountPage() {
  const { profile } = await requireCoachOrOwner();
  const isOwner = profile.role === "owner";

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-md mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Account settings</h1>
        <p className="text-xs text-blueprint-muted mb-8">{profile.email}</p>

        <p className="fb-eyebrow mb-3">Password</p>
        <p className="text-blueprint-muted text-sm leading-relaxed mb-6">
          Change the password you sign in with. You&apos;ll still enter your authenticator code each time.
        </p>
        <SetPasswordForm />

        {/* The whole gym's sessions in Guy's calendar. Not coaches (owner's call). */}
        {isOwner && (
          <>
            <p className="fb-eyebrow mt-10 mb-3">Add the gym to your calendar</p>
            <CalendarFeedCard isOwner />
          </>
        )}
      </div>
    </main>
  );
}
