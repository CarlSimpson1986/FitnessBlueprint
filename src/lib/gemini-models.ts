/**
 * Gemini model names, in one place — Google retires these regularly and a
 * retired name 404s at request time, taking the feature down with it.
 * Both Coach Ted (src/lib/coach-ted/gemini.ts) and workout Autofinish
 * (src/lib/progression-ai/gemini.ts) read from here.
 *
 * 2026-09-23: gemini-2.5-flash stopped being available to new API keys
 * ("no longer available to new users... use models/gemini-3.6-flash").
 */
export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";
