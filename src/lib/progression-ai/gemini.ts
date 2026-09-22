import { GoogleGenerativeAI } from "@google/generative-ai";
import { serverEnv } from "@/lib/env";
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

  const model = getClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: PROGRESSION_SYSTEM_PROMPT,
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = `Week 1 (JSON, this exact shape repeats for every week in your output):
${JSON.stringify(week1)}

Progression instruction from the coach: "${instruction}"

Generate exactly ${additionalWeeks} additional week(s) (week 2 through week ${weekCount}), each following week 1's shape. Return a JSON array of ${additionalWeeks} week(s), where each week is an array of segments in the same shape as week 1 above.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned a response that wasn't valid JSON — try again.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini's response wasn't shaped as expected — try again.");
  }

  return parsed as SegmentInput[][];
}
