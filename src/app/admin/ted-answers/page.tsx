import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { CACHE_SIMILARITY_THRESHOLD } from "@/lib/coach-ted/cache";
import { TedAnswersClient, type TedAnswerRow } from "./TedAnswersClient";

/**
 * Owner review of Coach Ted's answer cache: every answer Ted has saved for
 * reuse, plus Guy's own pinned answers. Read via "owner reads qa cache"
 * (0003) on the owner's RLS-respecting client.
 */
export default async function TedAnswersPage() {
  const { supabase } = await requireOwner();

  const { data } = await supabase
    .from("coach_ted_qa_cache")
    .select("id, question, answer, hit_count, is_pinned, is_flagged, created_at, last_served_at")
    .order("is_pinned", { ascending: false })
    .order("hit_count", { ascending: false })
    .order("created_at", { ascending: false });

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
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Ted&apos;s answers</h1>
        <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
          Ted saves every answer he writes and reuses it — instantly and for free — when a member asks
          something with the same meaning. Edit anything that isn&apos;t how you&apos;d say it, hide answers
          you don&apos;t want reused, or write your own.
        </p>
        <TedAnswersClient rows={(data ?? []) as TedAnswerRow[]} threshold={CACHE_SIMILARITY_THRESHOLD} />
      </div>
    </main>
  );
}
