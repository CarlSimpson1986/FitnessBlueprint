/**
 * How similar (cosine, 0-1) a new question's embedding must be to a cached
 * one for Coach Ted to reuse that answer instead of writing a new one.
 * Shared by the API route and the owner's tester on /admin/ted-answers.
 *
 * Every embedding model spreads its scores differently, so this must be
 * re-checked whenever EMBEDDING_MODEL in src/lib/coach-ted/gemini.ts
 * changes (use the tester: same-meaning pairs should clear it, related-
 * but-different pairs shouldn't).
 */
export const CACHE_SIMILARITY_THRESHOLD = 0.85;
