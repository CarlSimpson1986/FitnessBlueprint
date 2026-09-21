import Link from "next/link";
import { requireOwner } from "@/lib/auth";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export default async function ConversionsPage() {
  const { supabase } = await requireOwner();

  // The 6-week programme products are the membership_plans rows with
  // programme_length_days set (0001) — there's no separate "is this a
  // trial" flag, that column is the signal.
  const { data: programmePlans } = await supabase
    .from("membership_plans")
    .select("id, name, programme_length_days")
    .not("programme_length_days", "is", null);

  const programmePlanIds = (programmePlans ?? []).map((p) => p.id);
  const programmePlanById = new Map((programmePlans ?? []).map((p) => [p.id, p]));

  if (programmePlanIds.length === 0) {
    return (
      <main className="min-h-screen px-8 py-16">
        <div className="max-w-3xl mx-auto">
          <Link href="/admin" className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6">
            ← Admin
          </Link>
          <p className="fb-eyebrow mb-1">Owner</p>
          <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">6-week conversions</h1>
          <p className="text-blueprint-muted text-sm">No 6-week programme plans configured yet.</p>
        </div>
      </main>
    );
  }

  const { data: programmeMemberships } = await supabase
    .from("member_memberships")
    .select("id, member_id, plan_id, started_at")
    .in("plan_id", programmePlanIds)
    .order("started_at", { ascending: false });

  const memberIds = [...new Set((programmeMemberships ?? []).map((m) => m.member_id))];

  if (memberIds.length === 0) {
    return (
      <main className="min-h-screen px-8 py-16">
        <div className="max-w-3xl mx-auto">
          <Link href="/admin" className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6">
            ← Admin
          </Link>
          <p className="fb-eyebrow mb-1">Owner</p>
          <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">6-week conversions</h1>
          <p className="text-blueprint-muted text-sm">No one has taken a 6-week programme yet.</p>
        </div>
      </main>
    );
  }

  const [{ data: allMemberships }, { data: members }] = await Promise.all([
    supabase.from("member_memberships").select("id, member_id, plan_id, started_at").in("member_id", memberIds),
    supabase.from("profiles").select("id, full_name, email, phone").in("id", memberIds),
  ]);

  const memberById = new Map((members ?? []).map((m) => [m.id, m]));

  // Most recent programme membership per member — if someone did the
  // 6-week programme more than once historically, only the latest pass is
  // what's relevant to "have they converted since".
  const latestProgrammeByMember = new Map<string, { planId: string; startedAt: string }>();
  for (const m of programmeMemberships ?? []) {
    const existing = latestProgrammeByMember.get(m.member_id);
    if (!existing || m.started_at > existing.startedAt) {
      latestProgrammeByMember.set(m.member_id, { planId: m.plan_id, startedAt: m.started_at });
    }
  }

  const membershipsByMember = new Map<string, typeof allMemberships>();
  for (const m of allMemberships ?? []) {
    const list = membershipsByMember.get(m.member_id) ?? [];
    list.push(m);
    membershipsByMember.set(m.member_id, list);
  }

  const today = new Date();

  type Row = {
    memberId: string;
    name: string;
    email: string | null;
    phone: string | null;
    planName: string;
    startedAt: string;
    trialEndsAt: Date;
    converted: boolean;
    daysSinceEnd: number;
  };

  const rows: Row[] = [];
  for (const [memberId, programme] of latestProgrammeByMember) {
    const plan = programmePlanById.get(programme.planId);
    if (!plan) continue;
    const member = memberById.get(memberId);
    if (!member) continue;

    const startedAt = new Date(programme.startedAt);
    const trialEndsAt = new Date(startedAt.getTime() + (plan.programme_length_days ?? 42) * DAY_MS);

    const converted = (membershipsByMember.get(memberId) ?? []).some(
      (m) => m.plan_id !== programme.planId && new Date(m.started_at) > startedAt
    );

    rows.push({
      memberId,
      name: member.full_name,
      email: member.email,
      phone: member.phone,
      planName: plan.name,
      startedAt: programme.startedAt,
      trialEndsAt,
      converted,
      daysSinceEnd: daysBetween(trialEndsAt, today),
    });
  }

  const notConverted = rows
    .filter((r) => !r.converted && r.daysSinceEnd >= 0)
    .sort((a, b) => b.daysSinceEnd - a.daysSinceEnd);
  const inProgress = rows
    .filter((r) => !r.converted && r.daysSinceEnd < 0)
    .sort((a, b) => a.daysSinceEnd - b.daysSinceEnd);
  const converted = rows.filter((r) => r.converted);

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6">
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">6-week conversions</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Members whose 6-week programme has finished without moving onto another paid plan since.
          Private to you — coaches and members can&apos;t see this.
        </p>

        <p className="fb-eyebrow mb-3">Not converted ({notConverted.length})</p>
        {notConverted.length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-10">Nobody&apos;s finished their programme without converting.</p>
        ) : (
          <ul className="space-y-2 mb-10">
            {notConverted.map((r) => (
              <li key={r.memberId} className="border-l-2 border-red-400 bg-blueprint-raised/40 rounded px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-blueprint-ink font-medium">{r.name}</p>
                  <span className="text-xs text-red-400 whitespace-nowrap">
                    Ended {r.daysSinceEnd} day{r.daysSinceEnd === 1 ? "" : "s"} ago
                  </span>
                </div>
                <p className="text-xs text-blueprint-muted mt-1">
                  {r.planName}
                  {r.email && ` · ${r.email}`}
                  {r.phone && ` · ${r.phone}`}
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="fb-eyebrow mb-3">Still in progress ({inProgress.length})</p>
        {inProgress.length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-10">No one&apos;s currently mid-programme.</p>
        ) : (
          <ul className="space-y-2 mb-10">
            {inProgress.map((r) => (
              <li key={r.memberId} className="fb-card flex items-center justify-between gap-4">
                <p className="text-blueprint-ink font-medium">{r.name}</p>
                <span className="text-xs text-blueprint-muted whitespace-nowrap">
                  {Math.abs(r.daysSinceEnd)} day{Math.abs(r.daysSinceEnd) === 1 ? "" : "s"} left
                </span>
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
              <li key={r.memberId} className="text-sm text-blueprint-muted">
                {r.name} <span className="text-blueprint-accent">· converted</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
