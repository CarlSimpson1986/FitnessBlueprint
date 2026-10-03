import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { BodyMetricsForm } from "../BodyMetricsForm";
import { HealthLocked } from "@/components/HealthLocked";

export default async function LogMetricsPage() {
  const { profile } = await requireProfile();

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link href="/progress" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
          ← Progress
        </Link>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-6">Update measurements</h1>
        {/* 0043: needs health consent and body measurements switched on. */}
        {!profile.health_consent ? (
          <HealthLocked />
        ) : !profile.track_body_metrics ? (
          <div className="fb-card">
            <p className="text-sm text-blueprint-muted leading-relaxed">
              You&apos;ve turned off body measurements. Switch them back on in{" "}
              <Link href="/account/settings" className="text-blueprint-accent underline">
                Account settings
              </Link>{" "}
              if you&apos;d like to track them.
            </p>
          </div>
        ) : (
          <BodyMetricsForm />
        )}
      </div>
    </main>
  );
}
