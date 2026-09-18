"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

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

    try {
      const res = await fetch("/api/coach-ted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== pendingId));
        if (res.status === 429 && data?.error) {
          setError(data.error);
        } else {
          setError(data?.error ?? "Something went wrong — please try again.");
        }
        return;
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === pendingId ? { ...m, answer: data.answer as string } : m))
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== pendingId));
      setError("Something went wrong — please try again.");
    }

    setIsSubmitting(false);
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
                src="/coach-ted-avatar.png"
                alt=""
                width={20}
                height={20}
                className="rounded-full object-cover mt-0.5 shrink-0"
              />
              {message.answer === null ? (
                <p className="text-sm text-blueprint-muted">Thinking…</p>
              ) : (
                <p className="text-sm text-blueprint-ink whitespace-pre-wrap">{message.answer}</p>
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
