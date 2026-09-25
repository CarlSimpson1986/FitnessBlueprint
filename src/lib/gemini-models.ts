/**
 * Gemini model names, in one place — Google retires these regularly and a
 * retired name 404s at request time, taking the feature down with it.
 * Workout Autofinish (src/lib/progression-ai/gemini.ts) goes through
 * withGeminiFallback below. Coach Ted's answers moved to Claude on
 * 2026-09-25 (src/lib/coach-ted/claude.ts).
 *
 * 2026-09-23: gemini-2.5-flash stopped being available to new API keys
 * ("no longer available to new users... use models/gemini-3.6-flash").
 * gemini-3.6-flash then returned 503 "high demand" and took ~60s to its
 * first token, so there's a fallback chain and a low thinking setting.
 */
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

// Model chains, tried in order when one is overloaded (503), rate
// limited (429), erroring (500) or gone (404). The "-latest" aliases are
// Google's rolling pointers, so they survive the next rename.
// Autofinish: structured multi-week JSON, where quality matters more.
export const PLANNING_MODELS = [GEMINI_TEXT_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"];

/**
 * Short chat answers and structured JSON don't need long internal
 * reasoning — asking for minimal thinking is the difference between
 * seconds and a minute. Not in the installed SDK's types, and models that
 * don't accept it return 400, in which case we retry without it.
 */
export const LOW_THINKING = { thinkingConfig: { thinkingLevel: "minimal" } } as Record<string, unknown>;

const RETRY_NEXT_MODEL = new Set([404, 429, 500, 503]);

function statusOf(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "status" in err
    ? Number((err as { status: unknown }).status)
    : undefined;
}

/**
 * Runs `attempt` against each model in turn (with low thinking first,
 * then without if the model rejects that setting) until one succeeds.
 * Returns the result and which model produced it.
 */
export async function withGeminiFallback<T>(
  models: string[],
  attempt: (modelName: string, generationConfig: Record<string, unknown>) => Promise<T>
): Promise<{ result: T; model: string }> {
  let lastError: unknown;
  for (const modelName of models) {
    for (const config of [LOW_THINKING, {}]) {
      try {
        const result = await attempt(modelName, config);
        // Logged by callers — shows whether the low-thinking setting was accepted.
        return { result, model: config === LOW_THINKING ? `${modelName} (low thinking)` : modelName };
      } catch (err) {
        lastError = err;
        const status = statusOf(err);
        if (status === 400 && config === LOW_THINKING) continue; // retry without thinking config
        if (status !== undefined && RETRY_NEXT_MODEL.has(status)) break; // next model
        throw err;
      }
    }
  }
  throw lastError;
}
