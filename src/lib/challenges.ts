export type ChallengeType = "attendance" | "habit" | "event_prep" | "team";

/**
 * What a challenge counts, in members' words — shown instead of the type
 * name ("Attendance" on a 10k-steps challenge confused people, 2026-10-05).
 */
export const CHALLENGE_TRACKING_LABEL: Record<ChallengeType, string> = {
  attendance: "Counts classes you attend",
  habit: "Counts days you tick a habit",
  event_prep: "Tracked by your coach",
  team: "Team challenge · tracked by your coach",
};

/** "3 Oct – 31 Oct" (adds the year when it isn't this year). */
export function formatChallengeDates(startsAt: string, endsAt: string, today = new Date()) {
  const thisYear = today.getFullYear();
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      ...(d.getUTCFullYear() !== thisYear ? { year: "numeric" } : {}),
    });
  };
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

/**
 * Attendance/habit progress is derived from source-of-truth tables at read
 * time — same convention as computeWeekStreak in progress.ts — rather than
 * a stored counter. challenge_participants.progress_value has no RLS
 * update policy for anyone but the service role (0002), so nothing in the
 * app ever writes to it.
 *
 * event_prep/team have no data source to derive from yet: there's no
 * exercise/set-logging schema (event_prep) and no team/group table
 * (team). Returns null for those rather than guessing — the UI shows
 * them as coach-tracked instead of a computed bar.
 */
export function computeChallengeProgress(
  type: ChallengeType,
  window: { startsAt: string; endsAt: string },
  data: { attendedSessionDates: string[]; habitLogDates: string[] }
): number | null {
  if (type === "attendance") {
    return data.attendedSessionDates.filter(
      (d) => d >= window.startsAt && d <= window.endsAt
    ).length;
  }

  if (type === "habit") {
    return new Set(
      data.habitLogDates.filter((d) => d >= window.startsAt && d <= window.endsAt)
    ).size;
  }

  return null;
}
