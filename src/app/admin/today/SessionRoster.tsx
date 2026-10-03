"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SESSION_NOTE_MAX_LENGTH, SESSION_NOTE_TAGS, type SessionNote } from "@/lib/session-notes";
import { getSessionRoster, markAttendance, saveSessionNote, type ProgrammeTag, type RosterEntry } from "./actions";

const STATUS_LABEL: Record<RosterEntry["status"], string> = {
  booked: "Booked",
  attended: "Attended",
  no_show: "No-show",
  excused: "Excused",
  cancelled: "Cancelled",
  invited: "Invited (pending)",
};

const FEELING_LABEL: Record<"great" | "okay" | "rough", string> = {
  great: "Great",
  okay: "Okay",
  rough: "Rough",
};

function ReadinessNote({ readiness }: { readiness: NonNullable<RosterEntry["readiness"]> }) {
  const parts = [FEELING_LABEL[readiness.feeling]];
  if (readiness.sleepQuality) parts.push(`sleep: ${readiness.sleepQuality}`);

  return (
    <>
      <p
        className={
          readiness.feeling === "rough" ? "text-[10px] text-red-400 mt-0.5" : "text-[10px] text-blueprint-muted mt-0.5"
        }
      >
        {parts.join(" · ")}
      </p>
      {/* The member's own words from the pre-session check-in ("Any pain or niggles?"). */}
      {readiness.painArea && (
        <p className="text-xs text-amber-300 mt-1 border-l-2 border-amber-300/60 pl-2">
          &ldquo;{readiness.painArea}&rdquo;
        </p>
      )}
    </>
  );
}

/**
 * "6-week · Day 23/42" next to the name, so the coach can spot who's on a
 * programme and check in with them. The last week is flagged — that's
 * when the "what next?" conversation needs to happen. Past the last day
 * shows "finished" (the daily cron marks it expired the next morning).
 */
function ProgrammeBadge({ programme }: { programme: ProgrammeTag }) {
  const finished = programme.day > programme.lengthDays;
  const finalWeek = programme.day > programme.lengthDays - 7;
  return (
    <span
      className={
        finalWeek
          ? "ml-2 inline-block text-[10px] font-mono uppercase tracking-wide rounded px-1.5 py-0.5 border border-amber-300/60 text-amber-300"
          : "ml-2 inline-block text-[10px] font-mono uppercase tracking-wide rounded px-1.5 py-0.5 border border-blueprint-accent/60 text-blueprint-accent"
      }
    >
      {finished ? (
        `${programme.label} · finished`
      ) : (
        <>
          {programme.label} · Day {programme.day}/{programme.lengthDays}
          {finalWeek && " · final week"}
        </>
      )}
    </span>
  );
}

function noteSummary(note: SessionNote) {
  return [...note.tags, ...(note.text ? [`“${note.text}”`] : [])].join(" · ");
}

function shortDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * After the session the coach taps tags and/or types a line (phone
 * keyboards' mic button covers dictation). One note per member per
 * session; saving with nothing selected clears it.
 */
function NoteEditor({
  sessionId,
  entry,
  onSaved,
  onCancel,
}: {
  sessionId: string;
  entry: RosterEntry;
  onSaved: (note: SessionNote | null) => void;
  onCancel: () => void;
}) {
  const [tags, setTags] = useState<string[]>(entry.note?.tags ?? []);
  const [text, setText] = useState(entry.note?.text ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveSessionNote(sessionId, entry.memberId, tags, text);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const trimmed = text.trim();
    onSaved(tags.length === 0 && !trimmed ? null : { tags, text: trimmed || null });
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {SESSION_NOTE_TAGS.map((tag) => {
          const on = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={
                on
                  ? "text-[11px] rounded-full px-2.5 py-1 border border-blueprint-accent bg-blueprint-accent/15 text-blueprint-accent"
                  : "text-[11px] rounded-full px-2.5 py-1 border border-blueprint-line text-blueprint-muted hover:text-blueprint-ink"
              }
            >
              {tag}
            </button>
          );
        })}
      </div>
      <textarea
        rows={2}
        maxLength={SESSION_NOTE_MAX_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. progressed deadlift to 80kg, left shoulder still restricted"
        className="w-full bg-blueprint-bg border border-blueprint-line rounded text-sm text-blueprint-ink px-2 py-1.5 focus:outline-none focus:border-blueprint-accent"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="fb-btn-primary text-xs px-3 py-1 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save note"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-blueprint-muted hover:text-blueprint-ink">
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** One-line picture of the whole class before it starts. */
function ClassReadinessSummary({ roster }: { roster: RosterEntry[] }) {
  const active = roster.filter((e) => e.status !== "cancelled");
  const checkedIn = active.filter((e) => e.readiness);
  const count = (feeling: "great" | "okay" | "rough") => checkedIn.filter((e) => e.readiness?.feeling === feeling).length;
  const comments = checkedIn.filter((e) => e.readiness?.painArea).length;

  return (
    <p className="text-xs text-blueprint-muted mb-3">
      <span className="text-blueprint-ink font-medium">{active.length} attending</span> · {checkedIn.length} checked in
      {checkedIn.length > 0 && (
        <>
          {" "}
          — {count("great")} great, {count("okay")} okay,{" "}
          <span className={count("rough") > 0 ? "text-red-400" : undefined}>{count("rough")} rough</span>
          {comments > 0 && <span className="text-amber-300"> · {comments} comment{comments === 1 ? "" : "s"}</span>}
        </>
      )}
    </p>
  );
}

/** `canMark` false = view-only (a coach looking at a class they aren't taking). */
export function SessionRoster({ sessionId, canMark = true }: { sessionId: string; canMark?: boolean }) {
  const router = useRouter();
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSessionRoster(sessionId).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setRoster(result.roster ?? []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function handleMark(bookingId: string, status: "attended" | "no_show" | "excused") {
    setPendingBookingId(bookingId);
    setError(null);

    const result = await markAttendance(bookingId, status);

    if (result.error) {
      setError(result.error);
    } else {
      setRoster((prev) => prev?.map((entry) => (entry.bookingId === bookingId ? { ...entry, status } : entry)) ?? null);
      router.refresh();
    }

    setPendingBookingId(null);
  }

  if (error && roster === null) {
    return <p className="text-xs text-red-400 px-4 pb-3">{error}</p>;
  }

  if (roster === null) {
    return <p className="text-xs text-blueprint-muted px-4 pb-3">Loading roster…</p>;
  }

  if (roster.length === 0) {
    return <p className="text-xs text-blueprint-muted px-4 pb-3">No one&apos;s booked in yet.</p>;
  }

  return (
    <div className="px-4 pb-4">
      <ClassReadinessSummary roster={roster} />
      <ul className="space-y-2">
        {roster.map((entry) => (
          <li key={entry.bookingId} className="border-t border-blueprint-line/60 pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="text-sm text-blueprint-ink">{entry.memberName}</span>
                {entry.programme && <ProgrammeBadge programme={entry.programme} />}
                {entry.readiness && <ReadinessNote readiness={entry.readiness} />}
              </span>

              {entry.status === "booked" && canMark ? (
                <div className="flex gap-1.5">
                  {(["attended", "no_show", "excused"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={pendingBookingId === entry.bookingId}
                      onClick={() => handleMark(entry.bookingId, status)}
                      className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted border border-blueprint-line rounded px-2 py-1 hover:border-blueprint-accent hover:text-blueprint-accent disabled:opacity-50 transition"
                    >
                      {STATUS_LABEL[status]}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">
                  {STATUS_LABEL[entry.status]}
                </span>
              )}
            </div>

            {entry.lastNote?.sessionDate && (
              <p className="text-[11px] text-blueprint-muted mt-1">
                Last time ({shortDate(entry.lastNote.sessionDate)}): {noteSummary(entry.lastNote)}
              </p>
            )}

            {editingNoteFor === entry.bookingId ? (
              <NoteEditor
                sessionId={sessionId}
                entry={entry}
                onCancel={() => setEditingNoteFor(null)}
                onSaved={(note) => {
                  setRoster((prev) => prev?.map((e) => (e.bookingId === entry.bookingId ? { ...e, note } : e)) ?? null);
                  setEditingNoteFor(null);
                }}
              />
            ) : (
              <>
                {entry.note && <p className="text-xs text-blueprint-ink mt-1">Note: {noteSummary(entry.note)}</p>}
                {canMark && entry.canNote && entry.status !== "cancelled" && entry.status !== "invited" && (
                  <button
                    type="button"
                    onClick={() => setEditingNoteFor(entry.bookingId)}
                    className="mt-1 text-[10px] font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent"
                  >
                    {entry.note ? "Edit note" : "+ Note"}
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
