import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { fetchSessionEconomics } from "@/lib/session-economics";
import { resolvePeriod } from "@/lib/period";
import { PeriodPicker } from "@/components/PeriodPicker";
import { DonutChart } from "@/components/DonutChart";

function pct(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export default async function SessionEconomicsPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; value?: string }>;
}) {
  await requireOwner();
  const params = await searchParams;
  const { start, end, label, unit, value } = resolvePeriod(params);

  const { byCoach, overall, unmarkedSessionCount, worstFill } = await fetchSessionEconomics(start, end);

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Session economics</h1>
        <p className="text-blueprint-muted mb-6 text-sm leading-relaxed">
          Fill rate and no-show rate per coach, computed from sessions that have already happened.
          Private to you.
        </p>

        <PeriodPicker unit={unit} value={value} />
        <p className="text-xs text-blueprint-muted -mt-6 mb-8">{label}</p>

        {overall.sessionCount === 0 ? (
          <p className="text-blueprint-muted text-sm">No sessions have happened yet in {label}.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              <div className="fb-card-accent text-center">
                <p className="text-2xl font-semibold text-blueprint-ink">{pct(overall.fillRate)}</p>
                <p className="text-xs text-blueprint-muted mt-1">
                  Fill rate ({overall.totalFilled}/{overall.totalCapacity} spots, {overall.sessionCount} sessions)
                </p>
              </div>
              <div className="fb-card text-center">
                <p className="text-lg font-semibold text-blueprint-ink">{pct(overall.noShowRate)}</p>
                <p className="text-xs text-blueprint-muted mt-1">
                  No-show rate ({overall.noShowCount}/{overall.attendanceMarked} marked)
                </p>
              </div>
              <div className="fb-card text-center">
                <p className="text-lg font-semibold text-blueprint-ink">{unmarkedSessionCount}</p>
                <p className="text-xs text-blueprint-muted mt-1">
                  Session{unmarkedSessionCount === 1 ? "" : "s"} with attendance never marked
                </p>
              </div>
            </div>

            {overall.attendanceMarked > 0 && (
              <div className="fb-card mb-10">
                <p className="text-blueprint-ink font-medium text-sm mb-4">Attendance breakdown</p>
                <DonutChart
                  centerLabel="Marked bookings"
                  centerValue={`${overall.attendanceMarked}`}
                  valueFormat="count"
                  segments={[
                    { label: "Attended", value: overall.attendedCount, color: "var(--fb-series-1)" },
                    { label: "No-show", value: overall.noShowCount, color: "var(--fb-series-2)" },
                    { label: "Excused", value: overall.excusedCount, color: "var(--fb-series-3)" },
                  ]}
                />
              </div>
            )}

            <p className="fb-eyebrow mb-3">By coach ({byCoach.length})</p>
            <ul className="space-y-2 mb-10">
              {byCoach.map((c) => (
                <li key={c.coachId} className="fb-card flex items-center justify-between gap-4">
                  <div>
                    <p className="text-blueprint-ink font-medium">{c.coachName}</p>
                    <p className="text-xs text-blueprint-muted mt-1">
                      {c.sessionCount} session{c.sessionCount === 1 ? "" : "s"} · {c.totalFilled}/{c.totalCapacity} spots filled
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-blueprint-ink font-medium">{pct(c.fillRate)} fill</p>
                    <p className="text-xs text-blueprint-muted mt-0.5">{pct(c.noShowRate)} no-show</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="fb-eyebrow mb-3">Lowest fill rate</p>
            <ul className="space-y-1.5">
              {worstFill.map((s) => (
                <li
                  key={s.sessionId}
                  className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-blueprint-ink truncate">
                      {s.templateName} · {s.coachName}
                    </p>
                    <p className="text-xs text-blueprint-muted mt-0.5">
                      {new Date(s.sessionDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{" "}
                      · {s.startTime.slice(0, 5)}
                    </p>
                  </div>
                  <span className="text-sm text-blueprint-ink font-medium shrink-0">
                    {s.filled}/{s.capacity} ({pct(s.fillRate)})
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
