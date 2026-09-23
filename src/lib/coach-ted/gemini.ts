import { GoogleGenerativeAI } from "@google/generative-ai";
import { serverEnv } from "@/lib/env";
import { CHAT_MODELS, withGeminiFallback } from "@/lib/gemini-models";

/**
 * Gemini Flash wrapper for Coach Ted.
 *
 * Model/SDK names drift fast in this space — verify against
 * https://ai.google.dev/gemini-api/docs before relying on this in
 * production. Written against the @google/generative-ai package and
 * the Gemini Flash model current as of this
 * spec (Aug 2026); check whether Google's since consolidated onto a
 * newer @google/genai package.
 */

let client: GoogleGenerativeAI | null = null;

function getClient() {
  if (!client) {
    const apiKey = serverEnv().GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set — Coach Ted can't run without it.");
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

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
export async function embedText(text: string): Promise<number[]> {
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

export type TedContext = {
  pubmedSources: { title: string; url: string; snippet: string }[];
  knowledgeBase: { category: string; content: string }[];
};

const TED_SYSTEM_PROMPT = `
You are Coach Ted, an AI fitness assistant for Fitness Blueprint, a
small-group personal training gym. You're named after the gym's dog —
friendly, knowledgeable, evidence-based, not academic. Like a
well-read training partner, not a textbook.

Rules you must always follow:
- Never diagnose an injury or medical condition. Direct to a GP or
  physiotherapist for anything that sounds like it needs one.
- Never override or contradict what a member's coach has told them.
  Defer to "chat to your coach about how this applies to your training."
- Never prescribe a specific supplement dose as medical advice — you
  can cite what doses studies used, but frame it as research findings,
  not a recommendation.
- Never give mental health advice — direct to appropriate resources.
- Use "we" when referring to Fitness Blueprint.
- Cite research in plain English ("a 2023 review in..."), not academic
  citation format.
- End every answer with a short line inviting the member to discuss
  further with their coach.
- Keep answers conversational and concise — a few short paragraphs,
  not an essay.
- Write plain text for a phone chat bubble: no markdown — no asterisks,
  bold, italics, or headings. A short "- " list is fine when it helps.
`.trim();

/**
 * Streams Ted's answer as it's generated, so the member sees it appear
 * within a few seconds instead of waiting for the whole thing.
 */
export async function* streamTedAnswer(
  question: string,
  context: TedContext,
  onModel?: (model: string) => void
): AsyncGenerator<string> {
  const contextBlock = [
    context.knowledgeBase.length
      ? `Fitness Blueprint's own guidance:\n${context.knowledgeBase
          .map((k) => `- [${k.category}] ${k.content}`)
          .join("\n")}`
      : "",
    context.pubmedSources.length
      ? `Relevant research:\n${context.pubmedSources
          .map((s) => `- ${s.title} (${s.url}): ${s.snippet}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = `Member's question: "${question}"\n\nContext:\n${contextBlock || "(no matching context found — answer from general exercise science knowledge, and be upfront that this isn't backed by a specific source this time)"}`;

  // Errors like 503 "high demand" surface when the stream is opened, so
  // falling back to another model happens before any text is sent.
  const { result, model } = await withGeminiFallback(CHAT_MODELS, (modelName, generationConfig) =>
    getClient()
      .getGenerativeModel({ model: modelName, systemInstruction: TED_SYSTEM_PROMPT, generationConfig })
      .generateContentStream(prompt)
  );
  onModel?.(model);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
