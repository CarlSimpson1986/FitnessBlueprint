"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { TedText } from "./TedText";
import { ANSWER_REPLACED_MARKER } from "@/lib/coach-ted/answer-check";
import { rateTedAnswer } from "./actions";

/** The server's answer check may send a corrected answer after the stream; it replaces what streamed. */
function shownAnswer(streamed: string) {
  const at = streamed.lastIndexOf(ANSWER_REPLACED_MARKER);
  return at === -1 ? streamed : streamed.slice(at + ANSWER_REPLACED_MARKER.length);
}

type Rating = "up" | "down" | null;

type Message = {
  id: string;
  question: string;
  answer: string | null;
  /** Null while an answer is still streaming, or if it wasn't saved. */
  conversationId: string | null;
  rating: Rating;
};

export function TedChat({ initialMessages }: { initialMessages: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The answer whose "What was wrong?" box is open, and what's typed in it.
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonSent, setReasonSent] = useState<Set<string>>(new Set());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const pendingId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: pendingId, question: trimmed, answer: null, conversationId: null, rating: null }]);
    setQuestion("");

    const setAnswer = (answer: string) =>
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, answer } : m)));

    try {
      const res = await fetch("/api/coach-ted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      // Errors (rate limit, not signed in, bad input) come back as JSON;
      // a real answer streams back as plain text.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
        setError(data?.error ?? "Something went wrong — please try again.");
        return;
      }

      // Show Ted's answer as it arrives instead of waiting for all of it.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setAnswer(shownAnswer(answer));
      }
      answer = shownAnswer(answer + decoder.decode());
      setAnswer(answer || "Sorry — I didn't catch that. Please try again.");
      const conversationId = res.headers.get("X-Ted-Conversation-Id");
      if (answer && conversationId) {
        setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, conversationId } : m)));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      setError("Something went wrong — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function rate(message: Message, rating: Rating) {
    if (!message.conversationId) return;
    const next = message.rating === rating ? null : rating;
    const setRating = (value: Rating) =>
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, rating: value } : m)));
    setRating(next);
    setReasonFor(next === "down" ? message.id : null);
    setReason("");
    const result = await rateTedAnswer(message.conversationId, next);
    if (result.error) {
      setRating(message.rating);
      setError(result.error);
    }
  }

  return (
    <div>
      <div className="space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="fb-card">
            <p className="text-blueprint-muted text-sm">
              Ask Coach Ted anything about training, recovery or nutrition. He knows your goals and
              progress, so his answers are about you, and he may ask you a quick question first.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            <div className="fb-card-accent ml-8">
              <p className="text-sm text-blueprint-ink">{message.question}</p>
            </div>
            <div className="fb-card mr-8 flex items-start gap-2">
              <Image
                src="/coach-ted.png"
                alt=""
                width={20}
                height={20}
                className="rounded-full object-cover mt-0.5 shrink-0"
              />
              {message.answer === null || message.answer === "" ? (
                <p className="text-sm text-blueprint-muted">Thinking…</p>
              ) : (
                <TedText text={message.answer} />
              )}
            </div>
            {message.conversationId && (
              <div className="mr-8 flex items-center gap-3 pl-1">
                {(["up", "down"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => rate(message, value)}
                    aria-pressed={message.rating === value}
                    className={
                      "text-xs font-mono uppercase tracking-wide transition " +
                      (message.rating === value ? "text-blueprint-accent" : "text-blueprint-muted hover:text-blueprint-ink")
                    }
                  >
                    {value === "up" ? "Helpful" : "Not helpful"}
                  </button>
                ))}
                {message.rating === "down" && reasonFor !== message.id && (
                  <span className="text-xs text-blueprint-muted">Thanks, Guy will take a look.</span>
                )}
              </div>
            )}
            {message.conversationId && message.rating === "down" && reasonFor === message.id && !reasonSent.has(message.id) && (
              <form
                className="mr-8 flex items-center gap-2 pl-1"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!message.conversationId || !reason.trim()) return;
                  const result = await rateTedAnswer(message.conversationId, "down", reason);
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  setReasonSent((prev) => new Set(prev).add(message.id));
                  setReasonFor(null);
                }}
              >
                <input
                  type="text"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={300}
                  placeholder="What was wrong? (optional)"
                  className="flex-1 bg-blueprint-raised border border-blueprint-line rounded px-3 py-1.5 text-xs text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
                />
                <button
                  type="submit"
                  disabled={!reason.trim()}
                  className="text-xs font-mono uppercase tracking-wide text-blueprint-accent disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask Coach Ted…"
          maxLength={1000}
          disabled={isSubmitting}
          className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
        />
        <button
          type="submit"
          disabled={isSubmitting || !question.trim()}
          className="fb-btn-primary disabled:opacity-50"
        >
          {isSubmitting ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
