import Link from "next/link";
import { requireCoachOrOwner } from "@/lib/auth";
import { latestCheckinWeek, shiftWeek } from "@/lib/weekly-checkin";

function Rating({ label, value }: { label: string; value: number }) {
  return (
    <span className={value <= 2 ? "text-red-400" : value >= 4 ? "text-blueprint-ink" : "text-blueprint-muted"}>
      {label} {value}/5
    </span>
  );
}

/**
 * Members' Sunday check-ins for a week (weekly_checkins, 0028). Read-only
 * for coaches and the owner alike — "coaches and owner read all weekly
 * checkins" is the policy that lets this list everyone's; only members
 * write them.
 */
export default async function CheckinsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { supabase } = await requireCoachOrOwner();
  const { week } = await searchParams;
  const latest = latestCheckinWeek();
  const weekOf = week && /^\d{4}-\d{2}-\d{2}$/.test(week) && week <= latest ? week : latest;

  const [{ data: checkins }, { data: members }] = await Promise.all([
    supabase
      .from("weekly_checkins")
      .select("member_id, weight_kg, energy, sleep, nutrition, win, struggle, note_for_coach, created_at")
      .eq("week_of", weekOf)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("role", "member").order("full_name"),
  ]);

  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));
  const doneIds = new Set((checkins ?? []).map((c) => c.member_id));
  const notYet = (members ?? []).filter((m) => !doneIds.has(m.id));
  const label = new Date(`${weekOf}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Weekly check-ins</p>
        <div className="flex items-center justify-between gap-3 mb-8">
          <h1 className="text-2xl font-semibold text-blueprint-ink">Week of Sunday {label}</h1>
          <div className="flex gap-2 shrink-0">
            <Link
              href={`/admin/check-ins?week=${shiftWeek(weekOf, -1)}`}
              className="text-xs font-mono text-blueprint-muted hover:text-blueprint-accent border border-blueprint-line rounded px-2 py-1"
            >
              ←
            </Link>
            {weekOf < latest && (
              <Link
                href={`/admin/check-ins?week=${shiftWeek(weekOf, 1)}`}
                className="text-xs font-mono text-blueprint-muted hover:text-blueprint-accent border border-blueprint-line rounded px-2 py-1"
              >
                →
              </Link>
            )}
          </div>
        </div>

        <p className="fb-eyebrow mb-3">Checked in ({(checkins ?? []).length})</p>
        {(checkins ?? []).length === 0 ? (
          <p className="text-sm text-blueprint-muted mb-8">No check-ins yet for this week.</p>
        ) : (
          <ul className="space-y-3 mb-10">
            {(checkins ?? []).map((c) => (
              <li key={c.member_id} className="fb-card">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <p className="text-blueprint-ink font-medium">{nameById.get(c.member_id) ?? "Member"}</p>
                  {c.weight_kg !== null && <p className="text-sm text-blueprint-muted">{c.weight_kg}kg</p>}
                </div>
                <p className="text-xs flex gap-3 mb-2">
                  <Rating label="Energy" value={c.energy} />
                  <Rating label="Sleep" value={c.sleep} />
                  <Rating label="Nutrition" value={c.nutrition} />
                </p>
                {c.win && (
                  <p className="text-sm text-blueprint-ink">
                    <span className="text-blueprint-muted">Win:</span> {c.win}
                  </p>
                )}
                {c.struggle && (
                  <p className="text-sm text-blueprint-ink mt-1">
                    <span className="text-blueprint-muted">In the way:</span> {c.struggle}
                  </p>
                )}
                {c.note_for_coach && (
                  <p className="text-sm text-amber-300 mt-2 border-l-2 border-amber-300/60 pl-2">
                    &ldquo;{c.note_for_coach}&rdquo;
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="fb-eyebrow mb-3">Not checked in ({notYet.length})</p>
        {notYet.length === 0 ? (
          <p className="text-sm text-blueprint-muted">Everyone&apos;s checked in.</p>
        ) : (
          <p className="text-sm text-blueprint-muted leading-relaxed">{notYet.map((m) => m.full_name).join(" · ")}</p>
        )}
      </div>
    </main>
  );
}
