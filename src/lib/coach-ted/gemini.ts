import { serverEnv } from "@/lib/env";

/**
 * Gemini embeddings for Coach Ted's answer cache and knowledge base.
 * Answers themselves are written by Claude (src/lib/coach-ted/claude.ts).
 */

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768; // must match vector(768) in 0003_coach_ted_vectors.sql

/**
 * Embeds text into a 768-dim vector for pgvector similarity search.
 *
 * text-embedding-004 was retired by Google (the API now 404s on it), which
 * broke every Coach Ted question at the first step. gemini-embedding-001
 * replaces it; it defaults to 3072 dims, so outputDimensionality asks for
 * 768 to fit the existing columns. The installed @google/generative-ai
 * (0.21) can't pass outputDimensionality, hence a direct REST call.
 * Google recommends normalising reduced-dimension output, so this does.
 *
 * Vectors from different embedding models aren't comparable — if this
 * model ever changes again, clear coach_ted_qa_cache and re-embed
 * coach_ted_knowledge_base.
 */
/**
 * taskType tells the model what the vector is for. SEMANTIC_SIMILARITY is
 * built for "do these two questions mean the same thing" — the answer
 * cache's job. Tested 2026-09-23 without it: paraphrases (79-81%) and
 * different questions (up to 80%, e.g. caffeine vs creatine) overlapped.
 * Changing it means re-embedding stored questions (Re-index on
 * /admin/ted-answers).
 */
export type EmbeddingTask = "SEMANTIC_SIMILARITY" | "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

export async function embedText(text: string, taskType: EmbeddingTask = "SEMANTIC_SIMILARITY"): Promise<number[]> {
  const apiKey = serverEnv().GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — Coach Ted can't run without it.");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Embedding failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data: { embedding?: { values?: number[] } } = await res.json();
  const values = data.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding returned ${values?.length ?? 0} dims, expected ${EMBEDDING_DIMENSIONS}.`);
  }

  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}
