import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { computeProgrammeRows, type ProgrammeRow } from "@/lib/conversions";
import { FollowUpControl } from "./FollowUpControl";

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function contact(r: ProgrammeRow) {
  return [r.planName, r.email, r.phone].filter(Boolean).join(" · ");
}

export default async function ConversionsPage() {
  const { supabase } = await requireOwner();
  const rows = await computeProgrammeRows(supabase);

  const notConverted = rows
    .filter((r) => !r.converted && r.daysSinceEnd > 0)
    .sort((a, b) => a.daysSinceEnd - b.daysSinceEnd);
  const inProgress = rows
    .filter((r) => !r.converted && r.daysSinceEnd <= 0)
    .sort((a, b) => b.daysSinceEnd - a.daysSinceEnd);
  const converted = rows.filter((r) => r.converted);

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6">
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Programme conversions</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Everyone on a fixed-length programme (6-week, 21-day) and whether they&apos;ve moved onto a plan since. Note
          the &ldquo;what next?&rdquo; chat on each one — anyone in their final week you haven&apos;t spoken to, or whose
          follow-up date arrives, is on your Monday email. Private to you — coaches and members can&apos;t see this.
        </p>

        <p className="fb-eyebrow mb-3">Still in progress ({inProgress.length})</p>
        {inProgress.length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-10">No one&apos;s currently mid-programme.</p>
        ) : (
          <ul className="space-y-2 mb-10">
            {inProgress.map((r) => {
              const daysLeft = -r.daysSinceEnd;
              const finalWeek = daysLeft < 7;
              return (
                <li
                  key={r.membershipId}
                  className={`border-l-2 ${finalWeek ? "border-amber-300" : "border-blueprint-line"} bg-blueprint-raised/40 rounded px-4 py-3`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-blueprint-ink font-medium">{r.name}</p>
                    <span className={`text-xs whitespace-nowrap ${finalWeek ? "text-amber-300" : "text-blueprint-muted"}`}>
                      {daysLeft === 0 ? "Last day today" : `${plural(daysLeft, "day")} left`}
                      {finalWeek && " · final week"}
                    </span>
                  </div>
                  <p className="text-xs text-blueprint-muted mt-1">{contact(r)}</p>
                  <FollowUpControl membershipId={r.membershipId} memberId={r.memberId} followUp={r.followUp} />
                </li>
              );
            })}
          </ul>
        )}

        <p className="fb-eyebrow mb-3">Finished, not converted ({notConverted.length})</p>
        {notConverted.length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-10">Nobody&apos;s finished their programme without converting.</p>
        ) : (
          <ul className="space-y-2 mb-10">
            {notConverted.map((r) => (
              <li key={r.membershipId} className="border-l-2 border-red-400 bg-blueprint-raised/40 rounded px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-blueprint-ink font-medium">{r.name}</p>
                  <span className="text-xs text-red-400 whitespace-nowrap">Ended {plural(r.daysSinceEnd, "day")} ago</span>
                </div>
                <p className="text-xs text-blueprint-muted mt-1">{contact(r)}</p>
                <FollowUpControl membershipId={r.membershipId} memberId={r.memberId} followUp={r.followUp} />
              </li>
            ))}
          </ul>
        )}

        <p className="fb-eyebrow mb-3">Converted ({converted.length})</p>
        {converted.length === 0 ? (
          <p className="text-blueprint-muted text-sm">No conversions yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {converted.map((r) => (
              <li key={r.membershipId} className="text-sm text-blueprint-muted">
                {r.name} <span className="text-blueprint-accent">· converted</span>
                <span className="text-xs"> ({r.planName})</span>
                {r.followUp?.note && <span className="text-xs"> — {r.followUp.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
