import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

/**
 * Coach Ted's answers, written by Claude Haiku 4.5.
 *
 * Moved off Gemini 2026-09-25: the free-tier Gemini key took 30-45s per
 * answer (queued behind paid traffic). Embeddings for the answer cache
 * still come from Gemini (src/lib/coach-ted/gemini.ts) — switching those
 * would mean re-embedding everything, and they were never the slow part.
 */
const TED_MODEL = "claude-haiku-4-5";

let client: Anthropic | null = null;

function getClient() {
  if (!client) {
    const apiKey = serverEnv().ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — Coach Ted can't run without it.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
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
- Don't talk about what guidance or sources you were or weren't given
  (no "I don't have a specific Fitness Blueprint guide on this") — just
  answer the question.
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

  const prompt = `Member's question: "${question}"\n\nContext:\n${contextBlock || "(none — answer from general exercise science knowledge)"}`;

  const stream = getClient().messages.stream({
    model: TED_MODEL,
    max_tokens: 2000,
    system: TED_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });
  onModel?.(TED_MODEL);

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  // A cut-off or declined answer must not land in the answer cache — the
  // route treats a throw as a failed answer and skips caching it.
  const final = await stream.finalMessage();
  if (final.stop_reason !== "end_turn") {
    throw new Error(`Coach Ted answer stopped early: ${final.stop_reason}`);
  }
}
