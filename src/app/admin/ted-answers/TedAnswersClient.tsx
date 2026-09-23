"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addTedAnswer,
  deleteTedAnswer,
  reindexTedAnswers,
  setTedAnswerFlags,
  testTedQuestion,
  updateTedAnswer,
  type SimilarityMatch,
} from "./actions";

export type TedAnswerRow = {
  id: string;
  question: string;
  answer: string;
  hit_count: number;
  is_pinned: boolean;
  is_flagged: boolean;
  created_at: string;
  last_served_at: string | null;
};

const fieldClass =
  "w-full bg-blueprint-bg border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent";

function useAction() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<{ error?: string }>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone?.();
      startTransition(() => router.refresh());
    });
  }
  return { run, isPending, error };
}

function AnswerCard({ row }: { row: TedAnswerRow }) {
  const { run, isPending, error } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.answer);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className={"fb-card " + (row.is_flagged ? "opacity-60" : "")}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-blueprint-ink font-medium">{row.question}</p>
        <div className="flex gap-1.5 shrink-0">
          {row.is_pinned && (
            <span className="text-[10px] font-mono uppercase tracking-wide text-blueprint-accent border border-blueprint-accent rounded px-1.5 py-0.5">
              Pinned
            </span>
          )}
          {row.is_flagged && (
            <span className="text-[10px] font-mono uppercase tracking-wide text-red-400 border border-red-400/60 rounded px-1.5 py-0.5">
              Hidden
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} className={fieldClass} />
      ) : (
        <p className="text-sm text-blueprint-muted whitespace-pre-wrap">{row.answer}</p>
      )}

      <p className="text-[11px] text-blueprint-muted mt-2">
        Reused {row.hit_count} time{row.hit_count === 1 ? "" : "s"}
        {row.last_served_at &&
          ` · last served ${new Date(row.last_served_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
      </p>

      <div className="flex flex-wrap gap-3 mt-3 text-xs font-mono uppercase tracking-wide">
        {editing ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => updateTedAnswer(row.id, draft), () => setEditing(false))}
              className="text-blueprint-accent disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => (setEditing(false), setDraft(row.answer))} className="text-blueprint-muted">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-blueprint-accent">
            Edit
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => setTedAnswerFlags(row.id, { is_pinned: !row.is_pinned }))}
          className="text-blueprint-muted hover:text-blueprint-ink"
        >
          {row.is_pinned ? "Unpin" : "Pin"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => setTedAnswerFlags(row.id, { is_flagged: !row.is_flagged }))}
          className="text-blueprint-muted hover:text-blueprint-ink"
        >
          {row.is_flagged ? "Unhide" : "Hide"}
        </button>
        {confirmDelete ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => deleteTedAnswer(row.id))}
            className="text-red-400"
          >
            Really delete?
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-blueprint-muted hover:text-red-400">
            Delete
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </li>
  );
}

function AddAnswer() {
  const { run, isPending, error } = useAction();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  return (
    <div className="fb-card space-y-2">
      <p className="text-blueprint-ink font-medium">Write Ted&apos;s answer yourself</p>
      <p className="text-xs text-blueprint-muted">
        Saved as pinned. Ted gives this answer to any member asking something with the same meaning.
      </p>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="The question, e.g. Should I train if I'm sore?" className={fieldClass} />
      <textarea rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer, in Ted's voice" className={fieldClass} />
      <button
        type="button"
        disabled={isPending || !question.trim() || !answer.trim()}
        onClick={() => run(() => addTedAnswer(question, answer), () => (setQuestion(""), setAnswer("")))}
        className="fb-btn-primary w-full text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save answer"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function SimilarityTester({ threshold }: { threshold: number }) {
  const [isPending, startTransition] = useTransition();
  const [question, setQuestion] = useState("");
  const [matches, setMatches] = useState<SimilarityMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="fb-card space-y-2">
      <p className="text-blueprint-ink font-medium">Would Ted reuse an answer for this?</p>
      <p className="text-xs text-blueprint-muted">
        Type a question a member might ask. Anything scoring {Math.round(threshold * 100)}% or more gets that saved
        answer instantly.
      </p>
      <div className="flex gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How much protein do I need?" className={fieldClass} />
        <button
          type="button"
          disabled={isPending || !question.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await testTedQuestion(question);
              if (result.error) setError(result.error);
              else setMatches(result.matches ?? []);
            })
          }
          className="fb-btn-primary text-sm shrink-0 disabled:opacity-50"
        >
          {isPending ? "…" : "Test"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {matches &&
        (matches.length === 0 ? (
          <p className="text-xs text-blueprint-muted">No saved answers yet.</p>
        ) : (
          <ul className="space-y-1">
            {matches.map((m) => (
              <li key={m.question} className="flex justify-between gap-3 text-sm">
                <span className="text-blueprint-ink truncate">{m.question}</span>
                <span
                  className={
                    "shrink-0 font-mono " + (m.similarity >= threshold ? "text-blueprint-accent" : "text-blueprint-muted")
                  }
                >
                  {Math.round(m.similarity * 100)}%{m.similarity >= threshold ? " · reused" : ""}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

/** Only needed after the embedding model/settings change (see gemini.ts). */
function ReindexButton() {
  const { run, isPending, error } = useAction();
  return (
    <span className="text-right">
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(reindexTedAnswers)}
        className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent disabled:opacity-50"
      >
        {isPending ? "Re-indexing…" : "Re-index"}
      </button>
      {error && <span className="block text-xs text-red-400">{error}</span>}
    </span>
  );
}

export function TedAnswersClient({ rows, threshold }: { rows: TedAnswerRow[]; threshold: number }) {
  return (
    <div className="space-y-6">
      <SimilarityTester threshold={threshold} />
      <AddAnswer />
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="fb-eyebrow">Saved answers ({rows.length})</p>
          <ReindexButton />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-blueprint-muted">None yet — every new question Ted answers lands here.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <AnswerCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
