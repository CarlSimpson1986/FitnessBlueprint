import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  SCORE_TYPE_LABEL,
  formatPartScore,
  segmentDisplayLabel,
  type SegmentDraft,
} from "@/lib/workout-content";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Members' scores for this class's text parts (0066) — AMRAP rounds +
 * reps (most first), times (fastest first), notes. Staff only: coaches and
 * the owner read every score under "segment_scores: read" (0066), and
 * profiles' staff read policy gives the names. Nothing renders when no
 * part is scored.
 */
export async function PartScores({
  supabase,
  segments,
}: {
  supabase: ServerClient;
  /** The class's workout, as loadSessionWorkout returns it (key = segment id). */
  segments: SegmentDraft[];
}) {
  const scored = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment.textContent !== null && segment.scoreType !== "none");
  if (scored.length === 0) return null;

  const { data: scores } = await supabase
    .from("segment_scores")
    .select("segment_id, member_id, rounds, reps, time_seconds, notes")
    .in("segment_id", scored.map(({ segment }) => segment.key));

  const memberIds = [...new Set((scores ?? []).map((s) => s.member_id))];
  const { data: members } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", memberIds.length > 0 ? memberIds : [""]);
  const nameById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  return (
    <div className="fb-card space-y-4">
      <p className="fb-eyebrow">Scores</p>
      {scored.map(({ segment, index }) => {
        const rows = (scores ?? [])
          .filter((s) => s.segment_id === segment.key)
          .sort((a, b) =>
            segment.scoreType === "time"
              ? (a.time_seconds ?? Infinity) - (b.time_seconds ?? Infinity)
              : segment.scoreType === "rounds_reps"
                ? (b.rounds ?? 0) - (a.rounds ?? 0) || (b.reps ?? 0) - (a.reps ?? 0)
                : 0
          );
        return (
          <div key={segment.key}>
            <p className="text-xs text-blueprint-muted mb-1.5">
              {segmentDisplayLabel(segments, index)} · {SCORE_TYPE_LABEL[segment.scoreType]}
            </p>
            {rows.length === 0 ? (
              <p className="text-xs text-blueprint-dim">No scores yet.</p>
            ) : (
              <ul className="space-y-1">
                {rows.map((row) => (
                  <li key={row.member_id} className="flex justify-between gap-3 text-sm">
                    <span className="text-blueprint-ink truncate">{nameById.get(row.member_id) ?? "Member"}</span>
                    <span className="text-blueprint-muted text-right whitespace-pre-line">
                      {formatPartScore({
                        rounds: row.rounds,
                        reps: row.reps,
                        timeSeconds: row.time_seconds,
                        notes: row.notes,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
