import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { PLANNING_MODELS, withGeminiFallback } from "@/lib/gemini-models";
import type { SegmentInput } from "@/lib/workout-content";

/**
 * Gemini Flash wrapper for "Autofinish with AI" — generates weeks 2-N of
 * a training block from a coach-built week 1 and a plain-language
 * progression instruction. Deliberately a sibling to
 * src/lib/coach-ted/gemini.ts, not a reuse of generateTedAnswer — that
 * one's system prompt is baked with Ted's persona/rules, wrong for
 * structured data generation. Own lazy client, same reasoning as Ted's
 * (one GoogleGenerativeAI instance per process, not per call).
 *
 * Model/SDK names drift fast — verify against
 * https://ai.google.dev/gemini-api/docs before relying on this in
 * production, same caveat as coach-ted/gemini.ts.
 */

let client: GoogleGenerativeAI | null = null;

function getClient() {
  if (!client) {
    const apiKey = serverEnv().GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set — Autofinish can't run without it.");
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

// What Gemini must send back: the week-1 shape, checked field by field
// rather than trusted. Intensity limits match the check constraints in
// 0027 (paired, % of 1RM 0-100, RPE 1-10), so a bad week fails here with
// a clear message instead of at save time or by breaking the editor.
const setSchema = z
  .object({
    target: z.string().max(200).nullable(),
    restSeconds: z.number().int().min(0).max(3600).nullable(),
    intensityType: z.enum(["percent_1rm", "rpe"]).nullable().optional(),
    intensityValue: z.number().nullable().optional(),
  })
  .refine((set) => (set.intensityType ?? null) === null || typeof set.intensityValue === "number", "intensity needs a value")
  .refine(
    (set) =>
      set.intensityType == null ||
      (set.intensityType === "percent_1rm"
        ? set.intensityValue! > 0 && set.intensityValue! <= 100
        : set.intensityValue! >= 1 && set.intensityValue! <= 10),
    "intensity out of range"
  )
  .transform((set) => ({ ...set, intensityValue: set.intensityType == null ? null : set.intensityValue }));

const segmentSchema = z.object({
  type: z.enum(["warmup", "straight", "circuit", "finisher", "cooldown"]),
  label: z.string().max(200).nullable(),
  defaultRounds: z.number().int().min(1).max(50).nullable(),
  isScored: z.boolean().optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        metricType: z.enum(["weight_kg", "weight_kg_and_reps", "reps_only", "time_seconds", "distance_m"]),
        eachSide: z.boolean(),
        tempo: z.string().max(50).nullable(),
        note: z.string().max(1000).nullable(),
        videoUrl: z.string().max(500).nullable(),
        sets: z.array(setSchema).min(1).max(20),
      })
    )
    .min(1),
});

const PROGRESSION_SYSTEM_PROMPT = `
You generate the remaining weeks of a group-class training block from a
coach's week 1 and a plain-language progression instruction.

Critical rules, always:
- This is a GROUP class — many different members with different
  strength levels attend the same session. NEVER introduce a specific
  member-facing weight (e.g. "40kg", "increase to 60lbs"). Progress the
  "target" field the same way it's already written — if week 1 says
  "70% 1RM x5", week 2 might say "72.5% 1RM x5"; if it says "12 reps",
  week 2 might say "14 reps" — always a relative/structural change to
  the existing text, never a member-specific absolute number.
- Sets may carry "intensityType" ("percent_1rm" or "rpe") and
  "intensityValue". Progress intensity through intensityValue (e.g. 70 ->
  72.5 for percent_1rm, 7 -> 8 for rpe), keeping intensityType as is;
  percent_1rm stays <= 100 and rpe between 1 and 10. Leave both null on
  sets that have none.
- Only vary structural fields: sets (add/remove), rest seconds,
  exercise choice/order, and the free-text "target" string as described
  above. Never invent a metricType change unless the instruction asks
  for it. Keep each week's shape (segment types, roughly the same
  number of exercises) recognizable as a progression of week 1, not a
  different workout.
- Follow the coach's instruction for how to progress, but use
  reasonable, safe exercise-science judgment — don't jump intensity
  unsafely fast, and don't ignore an explicit deload/rest week if the
  instruction mentions one.
- Output ONLY valid JSON matching the exact shape you're given for week
  1 — an array of weeks, each week an array of segments with the same
  fields as the input. No prose, no markdown fences, no commentary.
`.trim();

/**
 * Returns weekCount - 1 generated weeks (week 1 is the coach's own,
 * never regenerated). Throws on a missing key (caller must catch — see
 * autofinish-actions.ts) or on a response that isn't valid JSON.
 */
export async function generateProgressionWeeks(
  week1: SegmentInput[],
  weekCount: number,
  instruction: string
): Promise<SegmentInput[][]> {
  const additionalWeeks = Math.max(weekCount - 1, 0);
  if (additionalWeeks === 0) return [];

  const prompt = `Week 1 (JSON, this exact shape repeats for every week in your output):
${JSON.stringify(week1)}

Progression instruction from the coach: "${instruction}"

Generate exactly ${additionalWeeks} additional week(s) (week 2 through week ${weekCount}), each following week 1's shape. Return a JSON array of ${additionalWeeks} week(s), where each week is an array of segments in the same shape as week 1 above.`;

  const { result } = await withGeminiFallback(PLANNING_MODELS, (modelName, generationConfig) =>
    getClient()
      .getGenerativeModel({
        model: modelName,
        systemInstruction: PROGRESSION_SYSTEM_PROMPT,
        generationConfig: { ...generationConfig, responseMimeType: "application/json" },
      })
      .generateContent(prompt)
  );
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned a response that wasn't valid JSON — try again.");
  }

  const weeks = z.array(z.array(segmentSchema).min(1)).length(additionalWeeks).safeParse(parsed);
  if (!weeks.success) {
    console.error("Autofinish: Gemini's weeks failed validation —", weeks.error.issues.slice(0, 5));
    throw new Error("Gemini's response wasn't shaped as expected — try again.");
  }

  // Scored or not follows week 1's section in the same place (or, failing
  // that, warm-ups and cool-downs aren't scored — 0057's default).
  return weeks.data.map((week) =>
    week.map((segment, i) => ({
      ...segment,
      isScored:
        week1[i]?.type === segment.type
          ? week1[i]!.isScored
          : (segment.isScored ?? !["warmup", "cooldown"].includes(segment.type)),
    }))
  );
}
