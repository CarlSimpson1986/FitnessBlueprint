"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { expressInterest, postMemberEvent } from "./events-actions";

export type EventItem = {
  id: string;
  title: string;
  description: string | null;
  eventType: "gym" | "member_posted";
  eventDate: string | null;
  location: string | null;
  registrationUrl: string | null;
  isPaid: boolean;
  interestCount: number;
  isInterested: boolean;
};

function formatEventDate(dateStr: string | null) {
  if (!dateStr) return "Date TBC";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function InterestButton({ event }: { event: EventItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [joined, setJoined] = useState(event.isInterested);

  function handleClick() {
    startTransition(async () => {
      const result = await expressInterest(event.id);
      if (!result.error) {
        setJoined(true);
        startTransition(() => router.refresh());
      }
    });
  }

  if (joined) {
    return (
      <span className="text-xs font-medium text-blueprint-accent border border-blueprint-accent rounded-lg px-3 py-2">
        You&apos;re in{event.interestCount > 0 ? ` · ${event.interestCount}` : ""}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-2 hover:opacity-90 disabled:opacity-50 transition"
    >
      {isPending ? "…" : `I'm in${event.interestCount > 0 ? ` · ${event.interestCount}` : ""}`}
    </button>
  );
}

function EventCard({ event }: { event: EventItem }) {
  return (
    <li className="fb-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="fb-eyebrow mb-1">
            {event.eventType === "gym" ? "Gym event" : "Member event"}
            {event.isPaid ? " · Paid" : ""}
          </p>
          <p className="text-blueprint-ink font-medium">{event.title}</p>
          <p className="text-xs text-blueprint-muted mt-1">
            {formatEventDate(event.eventDate)}
            {event.location ? ` · ${event.location}` : ""}
          </p>
          {event.description && (
            <p className="text-xs text-blueprint-muted mt-2">{event.description}</p>
          )}
          {event.registrationUrl && (
            <a
              href={event.registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blueprint-accent underline mt-2 inline-block"
            >
              Register
            </a>
          )}
        </div>
        <InterestButton event={event} />
      </div>
    </li>
  );
}

function PostEventForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await postMemberEvent({ title, eventDate, location, description });

      if (result.error) {
        setError(result.error);
        return;
      }

      setTitle("");
      setEventDate("");
      setLocation("");
      setDescription("");
      setIsOpen(false);
      startTransition(() => router.refresh());
    });
  }

  if (!isOpen) {
    return (
      <button type="button" onClick={() => setIsOpen(true)} className="fb-btn-secondary w-full">
        Post your own event
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="fb-card space-y-3">
      <input
        type="text"
        required
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="What's happening?"
        className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted"
      />
      <input
        type="date"
        value={eventDate}
        onChange={(event) => setEventDate(event.target.value)}
        className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink"
      />
      <input
        type="text"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
        placeholder="Location (optional)"
        className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Details (optional)"
        rows={2}
        className="w-full text-sm bg-transparent border border-blueprint-line rounded px-3 py-2 text-blueprint-ink placeholder:text-blueprint-muted resize-none"
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="fb-btn-primary disabled:opacity-50">
          {isPending ? "Posting…" : "Post event"}
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-blueprint-muted"
        >
          Cancel
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </form>
  );
}

export function EventsList({ events }: { events: EventItem[] }) {
  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <p className="text-blueprint-muted text-sm">Nothing coming up yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      )}
      <PostEventForm />
    </div>
  );
}
