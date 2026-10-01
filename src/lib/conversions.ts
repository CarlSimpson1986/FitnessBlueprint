import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

const DAY_MS = 24 * 60 * 60 * 1000;
const IN_CHUNK = 100;
/** How long after a programme ends an un-chatted non-converter stays on the Monday digest. */
export const FOLLOW_UP_WINDOW_DAYS = 30;

export const FOLLOW_UP_STATUSES = ["staying", "not_now", "follow_up"] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_LABEL: Record<FollowUpStatus | "none", string> = {
  none: "Not spoken yet",
  staying: "Talked — staying",
  not_now: "Talked — not now",
  follow_up: "Follow up on…",
};

export type FollowUp = { status: FollowUpStatus; followUpOn: string | null; note: string | null };

export type ProgrammeRow = {
  membershipId: string;
  memberId: string;
  name: string;
  email: string | null;
  phone: string | null;
  planName: string;
  /** Inclusive UK date — same rule as book_session()'s cut-off (0030). */
  lastDay: string;
  /** Positive once the programme is over, 0 on the last day, negative = days left. */
  daysSinceEnd: number;
  converted: boolean;
  followUp: FollowUp | null;
};

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

function addDays(dateKey: string, days: number) {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string) {
  return Math.round((new Date(`${toKey}T00:00:00Z`).getTime() - new Date(`${fromKey}T00:00:00Z`).getTime()) / DAY_MS);
}

async function inChunks<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await run(ids.slice(i, i + IN_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}

/**
 * Everyone's latest fixed-length programme (any plan with
 * programme_length_days — 6-week now, 21-day later), whether they've
 * moved onto another plan since, and the owner's follow-up note.
 * Shared by /owner/conversions and the Monday digest. Pass the owner's
 * RLS client (owner reads memberships, profiles and programme_followups,
 * 0002/0037) or, from the cron, the admin client.
 */
export async function computeProgrammeRows(supabase: Supabase, today = new Date()): Promise<ProgrammeRow[]> {
  const todayKey = ukDateKey(today);

  const { data: plans } = await supabase
    .from("membership_plans")
    .select("id, name, programme_length_days")
    .not("programme_length_days", "is", null);
  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  if (planById.size === 0) return [];

  const { data: programmeMemberships } = await supabase
    .from("member_memberships")
    .select("id, member_id, plan_id, started_at")
    .in("plan_id", [...planById.keys()]);

  // Latest programme per member — an earlier pass doesn't matter for
  // "have they converted since".
  const latestByMember = new Map<string, { id: string; planId: string; startedAt: string }>();
  for (const m of programmeMemberships ?? []) {
    const existing = latestByMember.get(m.member_id);
    if (!existing || m.started_at > existing.startedAt) {
      latestByMember.set(m.member_id, { id: m.id, planId: m.plan_id, startedAt: m.started_at });
    }
  }
  const memberIds = [...latestByMember.keys()];
  if (memberIds.length === 0) return [];

  const [allMemberships, members, followUps] = await Promise.all([
    inChunks(memberIds, (chunk) =>
      supabase.from("member_memberships").select("member_id, plan_id, started_at").in("member_id", chunk)
    ),
    inChunks(memberIds, (chunk) => supabase.from("profiles").select("id, full_name, email, phone").in("id", chunk)),
    inChunks(
      [...latestByMember.values()].map((p) => p.id),
      (chunk) =>
        supabase.from("programme_followups").select("membership_id, status, follow_up_on, note").in("membership_id", chunk)
    ),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const followUpByMembership = new Map(followUps.map((f) => [f.membership_id, f]));

  const rows: ProgrammeRow[] = [];
  for (const [memberId, programme] of latestByMember) {
    const plan = planById.get(programme.planId);
    const member = memberById.get(memberId);
    if (!plan || !member) continue;

    const lastDay = addDays(ukDateKey(new Date(programme.startedAt)), (plan.programme_length_days ?? 42) - 1);
    const converted = allMemberships.some(
      (m) => m.member_id === memberId && m.plan_id !== programme.planId && m.started_at > programme.startedAt
    );
    const f = followUpByMembership.get(programme.id);

    rows.push({
      membershipId: programme.id,
      memberId,
      name: member.full_name,
      email: member.email,
      phone: member.phone,
      planName: plan.name,
      lastDay,
      daysSinceEnd: daysBetween(lastDay, todayKey),
      converted,
      followUp: f
        ? { status: f.status as FollowUpStatus, followUpOn: f.follow_up_on, note: f.note }
        : null,
    });
  }
  return rows;
}

/** In their last 7 days and nobody's had the chat yet. */
export function finishingNotSpokenTo(rows: ProgrammeRow[]) {
  return rows
    .filter((r) => !r.converted && r.daysSinceEnd <= 0 && r.daysSinceEnd > -7 && !r.followUp)
    .sort((a, b) => b.daysSinceEnd - a.daysSinceEnd);
}

/**
 * Finished without converting and needs a nudge: never spoken to (for a
 * month after finishing), or a follow-up date that has arrived.
 */
export function followUpsDue(rows: ProgrammeRow[], today = new Date()) {
  const todayKey = ukDateKey(today);
  return rows
    .filter((r) => {
      if (r.converted || r.daysSinceEnd <= 0) return false;
      if (!r.followUp) return r.daysSinceEnd <= FOLLOW_UP_WINDOW_DAYS;
      return r.followUp.status === "follow_up" && !!r.followUp.followUpOn && r.followUp.followUpOn <= todayKey;
    })
    .sort((a, b) => b.daysSinceEnd - a.daysSinceEnd);
}
