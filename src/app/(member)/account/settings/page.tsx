import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { SetPasswordForm } from "../SetPasswordForm";
import { CalendarFeedCard } from "./CalendarFeedCard";

export default async function AccountSettingsPage() {
  const { profile } = await requireProfile();

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-1">
          <Link href="/account" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
            ← Profile
          </Link>
          <HomeLink />
        </div>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-2">Account settings</h1>
        <p className="text-xs text-blueprint-muted mb-6">{profile.email}</p>

        <p className="fb-eyebrow mb-3">Password</p>
        <p className="text-blueprint-muted text-sm leading-relaxed mb-6">
          Optional — you can always sign in with a magic link instead. Set a password here if
          you&apos;d rather use one.
        </p>
        <SetPasswordForm />

        {/* Members get their bookings, the owner the whole gym. Not coaches (owner's call). */}
        {(profile.role === "member" || profile.role === "owner") && (
          <>
            <p className="fb-eyebrow mt-10 mb-3">Add to your calendar</p>
            <CalendarFeedCard isOwner={profile.role === "owner"} />
          </>
        )}
      </div>
    </main>
  );
}
