import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { isInternalAddress } from "@/lib/email";

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_SHOW_DAYS = 14;

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

function daysSince(dateKey: string, todayKey: string) {
  return Math.round((new Date(`${todayKey}T00:00:00Z`).getTime() - new Date(`${dateKey}T00:00:00Z`).getTime()) / DAY_MS);
}

/**
 * Members with an active plan who look like they're drifting away:
 * no session attended in NO_SHOW_DAYS days and nothing booked, plus
 * members still training but not checking in (no weekly check-in or
 * body-metrics log for 2 weeks — the same rule as the Monday quiet-member
 * email in src/app/api/cron/reminders/route.ts). Read on the owner's
 * RLS-respecting client: every table here has an is_coach_or_owner()
 * read policy (0002/0016/0028), and requireOwner() keeps it owner-only.
 */
export default async function AtRiskPage() {
  const { supabase } = await requireOwner();
  const now = new Date();
  const todayKey = ukDateKey(now);
  const twoWeeksAgoKey = ukDateKey(new Date(now.getTime() - NO_SHOW_DAYS * DAY_MS));

  const [{ data: members }, { data: activeMemberships }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, phone").eq("role", "member"),
    supabase.from("member_memberships").select("member_id, plan_id").eq("status", "active"),
    supabase.from("membership_plans").select("id, name"),
  ]);

  const planName = new Map((plans ?? []).map((p) => [p.id, p.name]));
  const planByMember = new Map((activeMemberships ?? []).map((m) => [m.member_id, planName.get(m.plan_id) ?? ""]));
  const activeMembers = (members ?? []).filter(
    (m) => planByMember.has(m.id) && !(m.email && isInternalAddress(m.email))
  );
  const memberIds = activeMembers.map((m) => m.id);

  const [{ data: bookings }, { data: checkins }, { data: metrics }] = memberIds.length
    ? await Promise.all([
        supabase.from("bookings").select("member_id, session_id, status").in("member_id", memberIds).in("status", ["attended", "booked"]),
        supabase.from("weekly_checkins").select("member_id, week_of").in("member_id", memberIds).gte("week_of", twoWeeksAgoKey),
        supabase.from("body_metrics").select("member_id, recorded_at").in("member_id", memberIds).gte("recorded_at", `${twoWeeksAgoKey}T00:00:00Z`),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const sessionIds = [...new Set((bookings ?? []).map((b) => b.session_id))];
  const { data: sessions } = sessionIds.length
    ? await supabase.from("sessions").select("id, session_date").in("id", sessionIds)
    : { data: [] };
  const sessionDate = new Map((sessions ?? []).map((s) => [s.id, s.session_date]));

  const lastAttended = new Map<string, string>();
  const hasUpcoming = new Set<string>();
  for (const b of bookings ?? []) {
    const date = sessionDate.get(b.session_id);
    if (!date) continue;
    if (b.status === "attended" && date > (lastAttended.get(b.member_id) ?? "")) lastAttended.set(b.member_id, date);
    if (b.status === "booked" && date >= todayKey) hasUpcoming.add(b.member_id);
  }

  const checkedInRecently = new Set([
    ...(checkins ?? []).map((c) => c.member_id),
    ...(metrics ?? []).map((m) => m.member_id),
  ]);

  const rows = activeMembers.map((m) => {
    const last = lastAttended.get(m.id) ?? null;
    return {
      ...m,
      plan: planByMember.get(m.id) ?? "",
      lastAttended: last,
      daysAway: last ? daysSince(last, todayKey) : null,
      hasUpcoming: hasUpcoming.has(m.id),
      checkedIn: checkedInRecently.has(m.id),
    };
  });

  const notTraining = rows
    .filter((r) => !r.hasUpcoming && (r.daysAway === null || r.daysAway >= NO_SHOW_DAYS))
    .sort((a, b) => (b.daysAway ?? 100000) - (a.daysAway ?? 100000));
  const notTrainingIds = new Set(notTraining.map((r) => r.id));
  const notCheckingIn = rows.filter((r) => !notTrainingIds.has(r.id) && !r.checkedIn);

  const contact = (r: (typeof rows)[number]) => (
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
