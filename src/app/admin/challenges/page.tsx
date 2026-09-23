import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { CreateChallengeForm } from "./CreateChallengeForm";

const TYPE_LABEL: Record<string, string> = {
  attendance: "Attendance",
  habit: "Habit",
  event_prep: "Event prep",
  team: "Team",
};

export default async function ManageChallengesPage() {
  const { supabase } = await requireOwner();

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: challenges }, { data: participantRows }] = await Promise.all([
    supabase.from("challenges").select("*").gte("ends_at", today).order("starts_at"),
    supabase.from("challenge_participants").select("challenge_id"),
  ]);

  const participantCountByChallenge = new Map<string, number>();
  for (const row of participantRows ?? []) {
    participantCountByChallenge.set(
      row.challenge_id,
      (participantCountByChallenge.get(row.challenge_id) ?? 0) + 1
    );
  }

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Coach</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Challenges</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Attendance and habit challenges track progress automatically from booking/habit
          history. Event prep and team challenges have no automatic data source yet — members
          just see &ldquo;your coach is tracking this.&rdquo;
        </p>

        <CreateChallengeForm />

        <p className="fb-eyebrow mb-3">Running now</p>
        {(challenges ?? []).length === 0 ? (
          <p className="text-blueprint-muted text-sm">Nothing running yet.</p>
        ) : (
          <ul className="space-y-2">
            {(challenges ?? []).map((challenge) => (
              <li
                key={challenge.id}
                className="border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-5 py-4"
              >
                <p className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-1">
                  {TYPE_LABEL[challenge.type] ?? challenge.type}
                  {challenge.is_open ? "" : " · Coach-assigned"}
                </p>
                <p className="text-blueprint-ink font-medium">{challenge.title}</p>
                <p className="text-xs text-blueprint-muted mt-1">
                  {challenge.starts_at} → {challenge.ends_at} · target {challenge.target_value} ·{" "}
                  {participantCountByChallenge.get(challenge.id) ?? 0} joined
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
