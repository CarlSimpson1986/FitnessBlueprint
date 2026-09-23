"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { TedText } from "./TedText";

type Message = {
  id: string;
  question: string;
  answer: string | null;
};

export function TedChat({ initialMessages }: { initialMessages: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const pendingId = `pending-${Date.now()}`;
    setMessages((prev) => [...prev, { id: pendingId, question: trimmed, answer: null }]);
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
        setAnswer(answer);
      }
      answer += decoder.decode();
      setAnswer(answer || "Sorry — I didn't catch that. Please try again.");
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      setError("Something went wrong — please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="fb-card">
            <p className="text-blueprint-muted text-sm">
              Ask Coach Ted anything about training, recovery, or nutrition principles.
              He&apos;ll always point you back to your coach for anything specific to you.
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
