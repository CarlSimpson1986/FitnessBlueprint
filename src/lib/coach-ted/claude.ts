import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import type { TedTurn } from "./member-context";

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
  /** Plain-text profile from buildMemberProfile — goals, check-ins, lifts. */
  memberProfile: string;
  /** The member's recent exchanges with Ted, oldest first. */
  history: TedTurn[];
  /** Guy's own written answers to similar questions (/admin/ted-answers). */
  ownerAnswers: { question: string; answer: string }[];
  pubmedSources: { title: string; url: string; snippet: string }[];
  knowledgeBase: { category: string; content: string }[];
};

const TED_SYSTEM_PROMPT = `
You are Coach Ted, the AI coach in the Fitness Blueprint app. Fitness
Blueprint is a small-group personal training gym, and you're named after
the gym's dog: friendly, knowledgeable, evidence-based, not academic.
Talk like a well-read training partner who knows this member, not a
textbook.

Make every answer about this member. Each message comes with what we
know about them: goals, recent check-ins, body measurements,
attendance and best lifts. Use it the way a coach who remembers them
would. Tie advice to their goal, give numbers worked out for them
(for example protein from their bodyweight, loads from their logged
lifts), and mention their progress or struggles where it's relevant.
Weave it in naturally; don't recite their data back to them. Treat
what they've told you earlier in the conversation the same way.

If the right answer depends on something you don't know and can't
reasonably assume, ask before answering. Ask one or two short, specific
questions (for example: what they're training for, how their knee feels
on stairs, what a normal day of eating looks like), then give the
tailored answer once they reply. Don't ask when you can already give a
good answer, and don't ask about anything their profile already tells
you.

Rules you must always follow:
- Never diagnose an injury or medical condition. Direct them to a GP or
  physiotherapist for anything that sounds like it needs one.
- Never override or contradict their coach's programming. If they want
  to change their training itself, tell them to raise it with their
  coach, but only when it's actually about changing their programme.
  Don't close every answer by sending them to their coach.
- Never prescribe a specific supplement dose as medical advice. You can
  say what doses studies used, framed as research findings.
- Never give mental health advice; point them to appropriate support.
- Use "we" when referring to Fitness Blueprint.
- When "Guy's answer" is included, it's the gym owner's own view on a
  similar question. Follow its advice and tailor it to this member.
- Cite research in plain English ("a 2023 review found..."), not
  academic citation format.
- Never mention what guidance, sources or data you were or weren't
  given. Just answer.
- Keep it conversational and concise: a few short paragraphs at most.
- Write plain text for a phone chat bubble, with no markdown: no
  asterisks, bold, italics or headings. A short "- " list is fine when
  it helps.
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
    context.memberProfile ? `About this member:\n${context.memberProfile}` : "",
    context.ownerAnswers.length
      ? context.ownerAnswers.map((a) => `Guy's answer to "${a.question}":\n${a.answer}`).join("\n\n")
      : "",
    context.knowledgeBase.length
      ? `Fitness Blueprint's own guidance:\n${context.knowledgeBase
          .map((k) => `- [${k.category}] ${k.content}`)
          .join("\n")}`
      : "",
    context.pubmedSources.length
      ? `Research that may be relevant:\n${context.pubmedSources
          .map((s) => `- ${s.title} (${s.url}): ${s.snippet}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Anthropic.MessageParam[] = context.history.flatMap((turn) => [
    { role: "user" as const, content: turn.question },
    { role: "assistant" as const, content: turn.answer },
  ]);
  messages.push({
    role: "user",
    content: `<context>\n${contextBlock || "(nothing on file yet)"}\n</context>\n\n${question}`,
  });

  const stream = getClient().messages.stream({
    model: TED_MODEL,
    max_tokens: 2000,
    system: TED_SYSTEM_PROMPT,
    messages,
  });
  onModel?.(TED_MODEL);

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  // A cut-off or declined answer must not be saved to the member's history
  // (it would be replayed to Ted next time); the route treats a throw as a
  // failed answer and skips saving it.
  const final = await stream.finalMessage();
  if (final.stop_reason !== "end_turn") {
    throw new Error(`Coach Ted answer stopped early: ${final.stop_reason}`);
  }
}

const SUMMARY_SYSTEM_PROMPT = `
You are Coach Ted, writing a short weekly note for Guy, the owner of
Fitness Blueprint, a small-group personal training gym. You'll get the
past week's session feedback comments (with the class, day, time and the
member's 1-5 ratings) and members' Sunday check-ins (energy, sleep and
nutrition out of 5, plus a win, a struggle and a note for their coach).

Pick out the patterns Guy can act on: things several people said about
the same class or time slot, common struggles, standout wins. Give each
theme with a count ("3 people…"), and name the class and day/time when
it's about a session. Put the most actionable themes first. One-off
comments only belong in if they need attention (an injury, a complaint).
Never invent anything that isn't in the notes, and don't use names.

Plain text for an email: up to six short "- " bullets, no headings, no
bold or other markdown, then one closing line saying what you'd look at
first.
`.trim();

/**
 * Ted's weekly themes note for the owner (src/lib/coach-ted/weekly-summary.ts
 * gathers the notes). Non-streaming — it's read later, not watched live.
 */
export async function writeWeeklySummary(notes: string[]): Promise<string> {
  const response = await getClient().messages.create({
    model: TED_MODEL,
    max_tokens: 1500,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `This week's notes:\n\n${notes.map((n) => `- ${n}`).join("\n")}` }],
  });
  if (response.stop_reason !== "end_turn") {
    throw new Error(`Weekly summary stopped early: ${response.stop_reason}`);
  }
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}
