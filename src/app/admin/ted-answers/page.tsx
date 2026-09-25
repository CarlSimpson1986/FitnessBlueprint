import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { OWNER_ANSWER_THRESHOLD } from "@/lib/coach-ted/cache";
import { TedAnswersClient, type TedAnswerRow } from "./TedAnswersClient";

/**
 * Guy's own written answers for Coach Ted to follow (coach_ted_qa_cache —
 * the old shared answer cache, repurposed 2026-09-25). Read via "owner reads qa cache"
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
          Ted writes every answer fresh for the member asking, using their goals and progress. Write
          your own answer to a common question and Ted will follow it (tailored to each member) whenever
          someone asks something with the same meaning. Hide an answer to stop Ted using it.
        </p>
        <TedAnswersClient rows={(data ?? []) as TedAnswerRow[]} threshold={OWNER_ANSWER_THRESHOLD} />
      </div>
    </main>
  );
}
