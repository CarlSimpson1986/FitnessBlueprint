import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { TedText } from "@/app/(member)/coach-ted/TedText";
import { markTedAnswerReviewed } from "./actions";

const LIST_LIMIT = 100;
const STATS_DAYS = 30;

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What Coach Ted has actually been telling members (0053). "Needs a look"
 * is answers a member marked not helpful, or where the answer check had
 * to remove a phone number or link — until Guy marks them reviewed.
 * Read on the owner's RLS client ("coach_ted_conversations: read" — the
 * member or the owner; coaches have no access).
 */
export default async function TedConversationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase } = await requireOwner();
  const { view } = await searchParams;
  const showAll = view === "all";

  const since = daysAgoIso(STATS_DAYS);
  const recent = () =>
    supabase.from("coach_ted_conversations").select("id", { count: "exact", head: true }).gte("created_at", since);

  let listQuery = supabase
    .from("coach_ted_conversations")
    .select("id, member_id, question, answer, created_at, member_rating, removed_items, owner_reviewed_at")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (!showAll) {
    listQuery = listQuery.is("owner_reviewed_at", null).or("member_rating.eq.down,removed_items.neq.{}");
  }

  const [{ data: rows }, total, helpful, notHelpful, removed] = await Promise.all([
    listQuery,
    recent(),
    recent().eq("member_rating", "up"),
    recent().eq("member_rating", "down"),
    recent().neq("removed_items", []),
  ]);

  const list = rows ?? [];
  const memberIds = [...new Set(list.map((r) => r.member_id))];
  const { data: members } = memberIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [] };
  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  const stats = [
    { label: "Answers", value: total.count ?? 0 },
    { label: "Helpful", value: helpful.count ?? 0 },
    { label: "Not helpful", value: notHelpful.count ?? 0 },
    { label: "Number/link removed", value: removed.count ?? 0 },
  ];

  const tabClass = (active: boolean) =>
    "text-xs font-mono uppercase tracking-wide px-3 py-1.5 rounded transition " +
    (active ? "bg-blueprint-raised text-blueprint-ink" : "text-blueprint-muted hover:text-blueprint-ink");

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Ted&apos;s conversations</h1>
        <p className="text-blueprint-muted mb-6 text-sm leading-relaxed">
          What Coach Ted has been telling members. &ldquo;Needs a look&rdquo; shows answers a member
          marked not helpful, or where Ted tried to give a phone number or link that isn&apos;t on his
          approved list (it was taken out of the answer). If Ted got something wrong, write your own
          answer and he&apos;ll follow it next time. Private to you.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          {stats.map((stat) => (
            <div key={stat.label} className="fb-card">
              <p className="text-xl font-semibold text-blueprint-ink">{stat.value}</p>
              <p className="text-xs text-blueprint-muted">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-blueprint-muted mb-8">Last {STATS_DAYS} days.</p>

        <div className="flex gap-1 mb-6">
          <Link href="/owner/ted-conversations" className={tabClass(!showAll)}>
            Needs a look
          </Link>
          <Link href="/owner/ted-conversations?view=all" className={tabClass(showAll)}>
            All recent
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-blueprint-muted">
            {showAll ? "No conversations yet." : "Nothing needs a look right now."}
          </p>
        ) : (
          <ul className="space-y-4">
            {list.map((row) => {
              const needsLook =
                !row.owner_reviewed_at && (row.member_rating === "down" || row.removed_items.length > 0);
              return (
                <li key={row.id} className="fb-card space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-blueprint-muted">
                    <span className="text-blueprint-ink font-medium">
                      {nameById.get(row.member_id) ?? "Unknown member"}
                    </span>
                    <span>{formatWhen(row.created_at)}</span>
                    {row.member_rating === "down" && <span className="text-red-400">Not helpful</span>}
                    {row.member_rating === "up" && <span className="text-blueprint-accent">Helpful</span>}
                    {row.owner_reviewed_at && <span>Reviewed</span>}
                  </div>
                  <p className="text-sm text-blueprint-ink">{row.question}</p>
                  <div className="border-l-2 border-blueprint-line pl-3">
                    <TedText text={row.answer} />
                  </div>
                  {row.removed_items.length > 0 && (
                    <p className="text-xs text-red-400">Removed: {row.removed_items.join(", ")}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <Link
                      href={`/admin/ted-answers?question=${encodeURIComponent(row.question)}`}
                      className="text-xs font-mono uppercase tracking-wide text-blueprint-accent hover:opacity-80"
                    >
                      Write your answer
                    </Link>
                    {needsLook && (
                      <form action={markTedAnswerReviewed.bind(null, row.id)}>
                        <button
                          type="submit"
                          className="text-xs font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-ink"
                        >
                          Mark reviewed
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
