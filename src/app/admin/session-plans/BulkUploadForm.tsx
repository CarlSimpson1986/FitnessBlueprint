"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { bulkUploadSessionPlans } from "./actions";

type Template = { id: string; name: string };

const PLACEHOLDER = `2026-09-22
Warm-up: 5 min row + mobility
Main: 5 rounds - 10 KB swings, 10 box jumps, 200m run
Finisher: plank hold 3x1min

2026-09-23
Warm-up: ...
Main: ...`;

export function BulkUploadForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [blockText, setBlockText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publishedCount: number; skippedDates?: string[] } | null>(
    null
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await bulkUploadSessionPlans({ templateId, blockText });

      if (response.error) {
        setError(response.error);
        return;
      }

      setResult({ publishedCount: response.publishedCount ?? 0, skippedDates: response.skippedDates });
      setBlockText("");
      startTransition(() => router.refresh());
    });
  }

  if (templates.length === 0) {
    return (
      <p className="text-xs text-blueprint-muted mb-10">
        Need at least one session type before uploading plans.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-10 border border-blueprint-line/60 rounded p-5">
      <div className="mb-4">
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Session type
        </label>
        <select
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className="w-full sm:w-64 bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-mono uppercase tracking-wide text-blueprint-muted mb-2">
          Block text
        </label>
        <p className="text-xs text-blueprint-muted mb-2">
          Start each day with a line containing just its date (YYYY-MM-DD), then the plan for
          that day underneath. Matched against already-scheduled sessions of the type above.
        </p>
        <textarea
          required
          value={blockText}
          onChange={(event) => setBlockText(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={12}
          className="w-full bg-blueprint-raised border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted/50 font-mono focus:outline-none focus:border-blueprint-accent"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="text-xs font-mono uppercase tracking-wide text-blueprint-bg bg-blueprint-accent rounded px-4 py-2 hover:opacity-90 disabled:opacity-50 transition"
        >
          {isPending ? "Uploading…" : "Upload block"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {result && (
          <p className="text-xs text-blueprint-accent">
            Published {result.publishedCount} session plan{result.publishedCount === 1 ? "" : "s"}.
            {result.skippedDates && (
              <> No scheduled session found for: {result.skippedDates.join(", ")}.</>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
