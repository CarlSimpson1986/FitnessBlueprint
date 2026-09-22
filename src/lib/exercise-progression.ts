/**
 * Reference-only weight suggestions for live-logging, computed from a
 * member's OWN most recent logged set of the same exercise — never a
 * fixed number the coach/AI prescribes (see the "never a member-
 * specific weight" rule from the Autofinish feature; this is the
 * separate, simpler feature that rule deliberately deferred to).
 *
 * Nothing here auto-fills a log — the member always types their own
 * number. This just gives them something to aim at when the coach's
 * target is written as "% 1RM" or "RPE" — free text on
 * session_exercise_sets.target, same field either way.
 */

/** Epley formula (1985) — standard, widely used estimated-1RM formula. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  const safeReps = Math.max(reps, 1);
  return weightKg * (1 + safeReps / 30);
}

/**
 * Approximates %1RM from an RPE + rep count using the "~2.5% of 1RM per
 * rep away from failure" heuristic that underlies most published RPE
 * charts (each rep in reserve, and each additional rep at the same
 * RPE, costs roughly the same ~2.5%). Deliberately a formula rather
 * than a copied chart — good enough for a reference hint, not intended
 * as a precise prescription.
 */
export function percentFromRpeAndReps(rpe: number, reps: number): number {
  const repsInReserve = 10 - rpe;
  const stepsFromOneRM = repsInReserve + (reps - 1);
  const percent = 100 - stepsFromOneRM * 2.5;
  return Math.min(100, Math.max(30, percent));
}

export type TargetProgression =
  | { type: "percent1rm"; percent: number }
  | { type: "rpe"; rpe: number; reps: number };

/** Parses a coach-written target string like "70% 1RM x5" or "RPE 8 x5". */
export function parseTargetProgression(target: string | null): TargetProgression | null {
  if (!target) return null;

  const percentMatch = target.match(/(\d+(?:\.\d+)?)\s*%\s*1\s*rm/i);
  if (percentMatch) {
    return { type: "percent1rm", percent: Number(percentMatch[1]) };
  }

  const rpeMatch = target.match(/rpe\s*(\d+(?:\.\d+)?)/i);
  if (rpeMatch) {
    const repsMatch = target.match(/x\s*(\d+)/i) ?? target.match(/(\d+)\s*reps?/i);
    if (repsMatch) {
      return { type: "rpe", rpe: Number(rpeMatch[1]), reps: Number(repsMatch[1]) };
    }
  }

  return null;
}

export type WeightSuggestion = { suggestedKg: number; basis: string };

/**
 * lastReps defaults to 1 if the member's last log didn't have a rep
 * count (e.g. a straight top-set weight with no reps field) — treats
 * the last logged weight as roughly their 1RM in that case, which is
 * the safest assumption (never overestimates).
 */
export function suggestNextWeight(
  lastWeightKg: number,
  lastReps: number | null,
  target: string | null
): WeightSuggestion | null {
  const progression = parseTargetProgression(target);
  if (!progression) return null;

  const estimatedOneRM = estimateOneRepMax(lastWeightKg, lastReps ?? 1);

  if (progression.type === "percent1rm") {
    const suggestedKg = Math.round((estimatedOneRM * progression.percent) / 100 / 2.5) * 2.5;
    return { suggestedKg, basis: `${progression.percent}% of your ~${Math.round(estimatedOneRM)}kg est. 1RM` };
  }

  const percent = percentFromRpeAndReps(progression.rpe, progression.reps);
  const suggestedKg = Math.round((estimatedOneRM * percent) / 100 / 2.5) * 2.5;
  return { suggestedKg, basis: `RPE ${progression.rpe} estimate from your ~${Math.round(estimatedOneRM)}kg est. 1RM` };
}
