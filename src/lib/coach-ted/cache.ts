/**
 * How similar (cosine, 0-1) a member's question's embedding must be to one
 * of Guy's written answers (/admin/ted-answers) for Coach Ted to be handed
 * that answer to follow and tailor. Shared by the API route and the
 * owner's tester on /admin/ted-answers.
 *
 * Every embedding model spreads its scores differently, so this must be
 * re-checked whenever EMBEDDING_MODEL in src/lib/coach-ted/gemini.ts
 * changes (use the tester: same-meaning pairs should clear it, related-
 * but-different pairs shouldn't).
 */
// Calibrated 2026-09-23 with SEMANTIC_SIMILARITY embeddings via the
// tester: rewordings of the same question scored 94-97%; related but
// different questions 90-92% (protein for fat loss vs muscle 92, advanced
// vs beginner rest days 91, caffeine vs creatine 90, warm-up for running
// vs squats 90). Until 2026-09-25 matches were served verbatim, so the bar
// was 0.95; now Ted only follows Guy's answer and still writes his own
// reply, so 0.93 lets every rewording through while keeping related-but-
// different questions out.
export const OWNER_ANSWER_THRESHOLD = 0.93;
