"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createGymEvent } from "./actions";

export function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [registrationUrl, setRegistrationUrl] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await createGymEvent({
        title,
        eventDate,
        location,
        description,
        registrationUrl,
        isPaid,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setTitle("");
      setEventDate("");
      setLocation("");
      setDescription("");
      setRegistrationUrl("");
      setIsPaid(false);
      setSuccess(true);
      startTransition(() => router.refresh());
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-10 border border-blueprint-line/60 rounded p-5 grid grid-cols-1 sm:grid-cols-2 gap-4"
    >
      <div className="sm:col-span-2">
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Title
        </label>
        <input
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Date
        </label>
        <input
          type="date"
          value={eventDate}
          onChange={(event) => setEventDate(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Location
        </label>
        <input
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Registration link
        </label>
        <input
          type="url"
          value={registrationUrl}
          onChange={(event) => setRegistrationUrl(event.target.value)}
          placeholder="Optional"
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted/60 focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm text-blueprint-ink">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(event) => setIsPaid(event.target.checked)}
            className="accent-blueprint-accent"
          />
          Paid event
        </label>
      </div>

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {isPending ? "Posting…" : "Post event"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {success && <p className="text-xs text-blueprint-accent">Posted.</p>}
      </div>
    </form>
  );
}
