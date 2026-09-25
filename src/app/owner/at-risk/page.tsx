import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { computeAtRisk, NO_SHOW_DAYS, type AtRiskRow } from "@/lib/at-risk";

/** Owner-only list of members drifting away — logic in src/lib/at-risk.ts. */
export default async function AtRiskPage() {
  const { supabase } = await requireOwner();
  const { notTraining, notCheckingIn } = await computeAtRisk(supabase);

  const contact = (r: AtRiskRow) => (
    <p className="text-xs text-blueprint-muted mt-1">
      {r.plan}
      {r.email && ` · ${r.email}`}
      {r.phone && ` · ${r.phone}`}
    </p>
  );

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6">
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">At-risk members</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Members on an active plan who might be drifting away, worth a message. Private to you —
          coaches and members can&apos;t see this.
        </p>

        <p className="fb-eyebrow mb-3">Not training ({notTraining.length})</p>
        <p className="text-xs text-blueprint-muted mb-3">
          No session in {NO_SHOW_DAYS}+ days and nothing booked.
        </p>
        {notTraining.length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-10">Everyone&apos;s training or booked in.</p>
        ) : (
          <ul className="space-y-2 mb-10">
            {notTraining.map((r) => (
              <li key={r.id} className="border-l-2 border-red-400 bg-blueprint-raised/40 rounded px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-blueprint-ink font-medium">{r.full_name}</p>
                  <span className="text-xs text-red-400 whitespace-nowrap">
                    {r.daysAway === null ? "Never attended" : `Last in ${r.daysAway} days ago`}
                  </span>
                </div>
                {contact(r)}
              </li>
            ))}
          </ul>
        )}

        <p className="fb-eyebrow mb-3">Training but not checking in ({notCheckingIn.length})</p>
        <p className="text-xs text-blueprint-muted mb-3">
          No weekly check-in or measurements logged in the last 2 weeks.
        </p>
        {notCheckingIn.length === 0 ? (
          <p className="text-blueprint-muted text-sm">Everyone training is checking in.</p>
        ) : (
          <ul className="space-y-2">
            {notCheckingIn.map((r) => (
              <li key={r.id} className="fb-card">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-blueprint-ink font-medium">{r.full_name}</p>
                  <span className="text-xs text-blueprint-muted whitespace-nowrap">
                    {r.hasUpcoming ? "Booked in" : r.daysAway !== null ? `Last in ${r.daysAway} days ago` : ""}
                  </span>
                </div>
                {contact(r)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
