import { GoogleGenerativeAI } from "@google/generative-ai";
import { serverEnv } from "@/lib/env";

/**
 * Gemini Flash wrapper for Coach Ted.
 *
 * Model/SDK names drift fast in this space — verify against
 * https://ai.google.dev/gemini-api/docs before relying on this in
 * production. Written against the @google/generative-ai package and
 * the Gemini 2.5 Flash + text-embedding-004 models current as of this
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

/** Embeds text into a 768-dim vector for pgvector similarity search. */
export async function embedText(text: string): Promise<number[]> {
  const model = getClient().getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
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
`.trim();

export async function generateTedAnswer(
  question: string,
  context: TedContext
): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: TED_SYSTEM_PROMPT,
  });

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

  const result = await model.generateContent(prompt);
  return result.response.text();
}
