"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinChallenge } from "./challenges-actions";
import type { ChallengeType } from "@/lib/challenges";

export type ChallengeItem = {
  id: string;
  title: string;
  description: string | null;
  type: ChallengeType;
  isOpen: boolean;
  targetValue: number;
  startsAt: string;
  endsAt: string;
  participantCount: number;
  isJoined: boolean;
  progress: number | null;
};

const TYPE_LABEL: Record<ChallengeType, string> = {
  attendance: "Attendance",
  habit: "Habit",
  event_prep: "Event prep",
  team: "Team",
};

function ChallengeCard({ challenge }: { challenge: ChallengeItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [joined, setJoined] = useState(challenge.isJoined);
  const [error, setError] = useState<string | null>(null);

  function handleJoin() {
    setError(null);
    startTransition(async () => {
      const result = await joinChallenge(challenge.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setJoined(true);
      startTransition(() => router.refresh());
    });
  }

  const pct =
    joined && challenge.progress !== null
      ? Math.min(100, Math.round((challenge.progress / challenge.targetValue) * 100))
      : null;

  return (
    <li className="fb-card">
      <p className="fb-eyebrow mb-1">{TYPE_LABEL[challenge.type]}</p>
      <p className="text-blueprint-ink font-medium">{challenge.title}</p>
      {challenge.description && (
        <p className="text-xs text-blueprint-muted mt-1">{challenge.description}</p>
      )}
      <p className="text-xs text-blueprint-muted mt-1">
        {challenge.startsAt} → {challenge.endsAt} · {challenge.participantCount} joined
      </p>

      {joined ? (
        pct !== null ? (
          <div className="mt-3">
            <div className="h-1.5 bg-blueprint-line rounded-full overflow-hidden">
              <div
                className="h-full bg-blueprint-accent rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-blueprint-muted mt-1">
              {challenge.progress} / {challenge.targetValue}
            </p>
          </div>
        ) : (
          <p className="text-xs text-blueprint-accent mt-3">
            You&apos;re in — your coach is tracking progress on this one.
          </p>
        )
      ) : challenge.isOpen ? (
        <button
          type="button"
          onClick={handleJoin}
          disabled={isPending}
          className="fb-btn-secondary mt-3 disabled:opacity-50"
        >
          {isPending ? "…" : "Join challenge"}
        </button>
      ) : (
        <p className="text-xs text-blueprint-muted mt-3">Ask your coach to add you.</p>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </li>
  );
}

export function ChallengesList({ challenges }: { challenges: ChallengeItem[] }) {
  if (challenges.length === 0) {
    return <p className="text-blueprint-muted text-sm">No challenges running right now.</p>;
  }

  return (
    <ul className="space-y-2">
      {challenges.map((challenge) => (
        <ChallengeCard key={challenge.id} challenge={challenge} />
      ))}
    </ul>
  );
}
