"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assignTemplateToSession } from "../workout-templates/actions";
import { pasteSessionToDate, saveSessionWorkoutToLibrary } from "./sessions/[sessionId]/workout/actions";
import { CancelSessionButton } from "./CancelSessionButton";
import { createSessions } from "./schedule-actions";

export type DayCard = {
  sessionId: string;
  time: string;
  className: string;
  coachName: string;
  segmentCount: number;
  exerciseCount: number;
};

type ClassOption = { id: string; name: string };
type CoachOption = { id: string; full_name: string };

function QuickAddModal({
  dateKey,
  classes,
  coaches,
  onClose,
}: {
  dateKey: string;
  classes: ClassOption[];
  coaches: CoachOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(classes[0]?.id ?? "");
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? "");
  const [startTime, setStartTime] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSessions({
        templateId,
        coachId,
        startDate: dateKey,
        startTime,
        weeksToRepeat: 1,
        capacity: capacity ? Number(capacity) : null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onClose();
      startTransition(() => {
        router.refresh();
      });
    });
  }

  const inputClass =
    "w-full bg-blueprint-bg border border-blueprint-line rounded px-3 py-2 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-w-sm w-full bg-blueprint-bg-raised border border-blueprint-line rounded-lg p-5 space-y-3"
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-semibold text-blueprint-ink">Add a class — {label}</p>
          <button type="button" onClick={onClose} className="text-blueprint-muted hover:text-blueprint-ink text-sm">
            ✕
          </button>
        </div>

        {classes.length === 0 || coaches.length === 0 ? (
          <p className="text-xs text-blueprint-muted">
            Need at least one active class and one coach/owner profile before scheduling.
          </p>
        ) : (
          <>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select value={coachId} onChange={(e) => setCoachId(e.target.value)} className={inputClass}>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>

            <div className="flex gap-2">
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                min={1}
                placeholder="Capacity"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className={inputClass}
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button type="submit" disabled={isPending} className="fb-btn-primary w-full disabled:opacity-50">
              {isPending ? "Adding…" : "Add class"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}


type CopySource = { sessionId: string; label: string; dateKey: string };

const WEEKDAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function formatDayNumber(dateKey: string) {
  return Number(dateKey.slice(8, 10));
}

function isFirstOfMonth(dateKey: string, index: number, dayKeys: string[]) {
  if (index === 0) return true;
  const prev = dayKeys[index - 1];
  return prev !== undefined && prev.slice(0, 7) !== dateKey.slice(0, 7);
}

const menuItemClass =
  "block w-full text-left px-3 py-1.5 text-xs text-blueprint-ink hover:bg-blueprint-accent/15 disabled:opacity-50";

/**
 * Everfit-style card: the card itself opens the builder, everything else
 * lives behind the ⋯ menu (copy, save to library, assign template, cancel).
 */
function SessionCard({
  card,
  dateKey,
  templates,
  isCopySource,
  onCopy,
}: {
  card: DayCard;
  dateKey: string;
  templates: { id: string; name: string }[];
  isCopySource: boolean;
  onCopy: (source: CopySource) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"none" | "assign" | "library">("none");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [libraryName, setLibraryName] = useState(card.className);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasWorkout = card.segmentCount > 0;
  const builderHref = `/admin/program-calendar/sessions/${card.sessionId}/workout`;

  function closeMenu() {
    setMenuOpen(false);
    setPanel("none");
    setError(null);
  }

  function handleAssign() {
    if (!selectedTemplate) return;
    setError(null);
    startTransition(async () => {
      const result = await assignTemplateToSession(selectedTemplate, card.sessionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      closeMenu();
      startTransition(() => {
        router.refresh();
      });
    });
  }

  function handleSaveToLibrary() {
    setError(null);
    startTransition(async () => {
      const result = await saveSessionWorkoutToLibrary(card.sessionId, libraryName);
      if (result.error) {
        setError(result.error);
        return;
      }
      closeMenu();
      setNotice("Saved to library");
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <div
      className={
        "relative border rounded bg-blueprint-raised/60 p-2 text-left " +
        (isCopySource ? "border-blueprint-accent ring-1 ring-blueprint-accent" : "border-blueprint-line")
      }
    >
      <div className="flex items-start gap-1">
        <Link href={builderHref} className="flex-1 min-w-0 group">
          <p className="text-[11px] font-medium text-blueprint-accent group-hover:underline">
            {card.time} — {card.className}
          </p>
          <p className="text-[10px] text-blueprint-muted mt-0.5">{card.coachName}</p>
          <p className="text-[10px] text-blueprint-muted mt-1">
            {hasWorkout
              ? `${card.segmentCount} segment${card.segmentCount === 1 ? "" : "s"} · ${card.exerciseCount} exercise${card.exerciseCount === 1 ? "" : "s"}`
              : "No workout yet"}
          </p>
        </Link>
        <button
          type="button"
          aria-label="Session options"
          onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          className="shrink-0 -mt-0.5 px-1 leading-none text-blueprint-muted hover:text-blueprint-ink text-sm"
        >
          ⋯
        </button>
      </div>
      {notice && <p className="text-[10px] text-blueprint-accent mt-1">{notice}</p>}

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={closeMenu} />
          <div className="absolute right-0 top-7 z-40 w-52 rounded-md border border-blueprint-line bg-blueprint-bg-raised shadow-xl py-1">
            {panel === "none" && (
              <>
                <Link href={builderHref} className={menuItemClass}>
                  Open builder
                </Link>
                <button
                  type="button"
                  className={menuItemClass}
                  onClick={() => {
                    closeMenu();
                    setNotice(null);
                    onCopy({ sessionId: card.sessionId, label: `${card.time} — ${card.className}`, dateKey });
                  }}
                >
                  Copy
                </button>
                {hasWorkout && (
                  <button type="button" className={menuItemClass} onClick={() => setPanel("library")}>
                    Save workout to library
                  </button>
                )}
                {templates.length > 0 && (
                  <button type="button" className={menuItemClass} onClick={() => setPanel("assign")}>
                    Assign template…
                  </button>
                )}
                <div className="border-t border-blueprint-line/60 mt-1 px-3 pt-2 pb-1">
                  <CancelSessionButton sessionId={card.sessionId} />
                </div>
              </>
            )}

            {panel === "assign" && (
              <div className="px-3 py-2 space-y-2">
                <select
                  className="w-full bg-blueprint-bg border border-blueprint-line rounded text-xs text-blueprint-ink px-2 py-1.5"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  <option value="">Pick a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={!selectedTemplate || isPending}
                  className="fb-btn-primary w-full text-xs disabled:opacity-50"
                >
                  {isPending ? "Assigning…" : "Assign"}
                </button>
              </div>
            )}

            {panel === "library" && (
              <div className="px-3 py-2 space-y-2">
                <input
                  autoFocus
                  value={libraryName}
                  onChange={(e) => setLibraryName(e.target.value)}
                  placeholder="Template name"
                  className="w-full bg-blueprint-bg border border-blueprint-line rounded text-xs text-blueprint-ink px-2 py-1.5"
                />
                <button
                  type="button"
                  onClick={handleSaveToLibrary}
                  disabled={!libraryName.trim() || isPending}
                  className="fb-btn-primary w-full text-xs disabled:opacity-50"
                >
                  {isPending ? "Saving…" : "Save to library"}
                </button>
              </div>
            )}

            {error && <p className="px-3 pb-2 text-[10px] text-red-400">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function GhostCard({ source, label }: { source: CopySource; label: string }) {
  return (
    <div className="border border-dashed border-blueprint-accent rounded bg-blueprint-accent/15 p-2 text-left">
      <p className="text-[11px] font-medium text-blueprint-accent">{source.label}</p>
      <p className="text-[10px] text-blueprint-accent/80 mt-0.5">{label}</p>
    </div>
  );
}

export function ProgramCalendarClient({
  dayKeys,
  cardsByDate,
  templates,
  classes,
  coaches,
}: {
  dayKeys: string[];
  cardsByDate: Record<string, DayCard[]>;
  templates: { id: string; name: string }[];
  classes: ClassOption[];
  coaches: CoachOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [addingDate, setAddingDate] = useState<string | null>(null);
  const [copySource, setCopySource] = useState<CopySource | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [pasting, setPasting] = useState<{ dateKey: string; source: CopySource }[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const weeks: string[][] = [];
  for (let i = 0; i < dayKeys.length; i += 7) {
    weeks.push(dayKeys.slice(i, i + 7));
  }

  const todayKey = new Date();
  todayKey.setHours(0, 0, 0, 0);
  const todayIso =
    `${todayKey.getFullYear()}-${String(todayKey.getMonth() + 1).padStart(2, "0")}-${String(todayKey.getDate()).padStart(2, "0")}`;

  // Esc leaves copy mode, same as clicking "Done".
  useEffect(() => {
    if (!copySource) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCopySource(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copySource]);

  /**
   * Plain click pastes once and leaves copy mode; Shift+click pastes and
   * stays in copy mode so the same workout can go onto several days.
   */
  function handlePaste(dateKey: string, keepCopying: boolean) {
    if (!copySource || dateKey === copySource.dateKey) return;
    if (pasting.some((p) => p.dateKey === dateKey)) return;
    const source = copySource;
    setPasteError(null);
    setPasting((current) => [...current, { dateKey, source }]);
    if (!keepCopying) setCopySource(null);

    startTransition(async () => {
      const result = await pasteSessionToDate(source.sessionId, dateKey);
      setPasting((current) => current.filter((p) => p.dateKey !== dateKey));
      if (result.error) {
        setPasteError(result.error);
        return;
      }
      startTransition(() => {
        router.refresh();
      });
    });
  }

  return (
    <div>
      {copySource && (
        <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blueprint-accent bg-blueprint-bg-raised px-3 py-2">
          <p className="text-xs text-blueprint-ink">
            Copying <span className="text-blueprint-accent font-medium">{copySource.label}</span>. Click a day to
            paste. Hold <kbd className="font-mono text-[10px] border border-blueprint-line rounded px-1">Shift</kbd>{" "}
            while clicking to paste onto several days.
          </p>
          <button type="button" onClick={() => setCopySource(null)} className="fb-btn-primary text-xs px-3 py-1">
            Done
          </button>
        </div>
      )}
      {pasteError && (
        <p role="alert" className="mb-3 text-xs text-red-400">
          {pasteError}
        </p>
      )}

      <div className="grid grid-cols-7 gap-2 mb-1">
        {WEEKDAY_LABELS.map((label) => (
          <p key={label} className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted px-1">
            {label}
          </p>
        ))}
      </div>

      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="grid grid-cols-7 gap-2 mb-2">
          {week.map((dateKey, dayIndex) => {
            const globalIndex = weekIndex * 7 + dayIndex;
            const cards = cardsByDate[dateKey] ?? [];
            const isToday = dateKey === todayIso;
            const canPasteHere = copySource !== null && dateKey !== copySource.dateKey;
            const pendingPaste = pasting.find((p) => p.dateKey === dateKey);
            const isHoverTarget = canPasteHere && hoverDate === dateKey;

            return (
              <div
                key={dateKey}
                onMouseEnter={() => setHoverDate(dateKey)}
                onMouseLeave={() => setHoverDate((current) => (current === dateKey ? null : current))}
                className={
                  "relative min-h-[110px] rounded border p-1.5 space-y-1.5 " +
                  (isHoverTarget || pendingPaste
                    ? "border-blueprint-accent bg-blueprint-accent/5"
                    : isToday
                      ? "border-blueprint-accent"
                      : "border-blueprint-line/60")
                }
              >
                <p className="text-[10px] text-blueprint-muted px-0.5">
                  {isFirstOfMonth(dateKey, globalIndex, dayKeys)
                    ? new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                    : formatDayNumber(dateKey)}
                </p>
                {cards.map((card) => (
                  <SessionCard
                    key={card.sessionId}
                    card={card}
                    dateKey={dateKey}
                    templates={templates}
                    isCopySource={copySource?.sessionId === card.sessionId}
                    onCopy={(source) => {
                      setPasteError(null);
                      setCopySource(source);
                    }}
                  />
                ))}
                {pendingPaste ? (
                  <GhostCard source={pendingPaste.source} label="Pasting…" />
                ) : (
                  isHoverTarget && copySource && <GhostCard source={copySource} label="Click to paste here" />
                )}
                {!copySource && (
                  <button
                    type="button"
                    onClick={() => setAddingDate(dateKey)}
                    className="w-full text-[10px] font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent border border-dashed border-blueprint-line rounded py-1"
                  >
                    + Add
                  </button>
                )}

                {/* In copy mode the whole day cell is the paste target —
                    this overlay stops clicks reaching the cards underneath. */}
                {canPasteHere && (
                  <button
                    type="button"
                    aria-label={`Paste onto ${dateKey}`}
                    onClick={(event) => handlePaste(dateKey, event.shiftKey)}
                    className="absolute inset-0 z-10 cursor-copy rounded"
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {addingDate && (
        <QuickAddModal
          dateKey={addingDate}
          classes={classes}
          coaches={coaches}
          onClose={() => setAddingDate(null)}
        />
      )}
    </div>
  );
}
