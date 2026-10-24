"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SEGMENT_TYPE_ACCENT,
  describeSet,
  segmentDisplayLabel,
  toIntensityType,
  type SegmentType,
} from "@/lib/workout-content";

/** One class as gym_tv_board (0062) returns it. */
export type TvSession = {
  id: string;
  class_name: string;
  start_time: string; // "HH:MM:SS", UK time
  duration_minutes: number;
  coach_first_name: string | null;
  segments: {
    type: SegmentType;
    label: string | null;
    is_scored: boolean;
    /** Set = a text-only part (0065). */
    text_content: string | null;
    exercises: {
      name: string;
      each_side: boolean;
      tempo: string | null;
      sets: {
        target: string | null;
        rest_seconds: number | null;
        intensity_type: string | null;
        intensity_value: number | null;
      }[];
    }[];
  }[];
};

// Classes run back to back, so the board only moves on to the next one
// shortly before it starts (Carl, 2026-10-14).
const SWITCH_EARLY_MINUTES = 5;
const RELOAD_EVERY_MS = 60_000;

function londonNow(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return { minutes: hour * 60 + minute, clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Which class the board shows right now, or "done" once the last one has finished. */
function pickSession(sessions: TvSession[], nowMinutes: number): { index: number; done: boolean } {
  let index = -1;
  sessions.forEach((s, i) => {
    if (toMinutes(s.start_time) - SWITCH_EARLY_MINUTES <= nowMinutes) index = i;
  });
  if (index === -1) return { index: 0, done: false }; // before the first class: show it as coming up
  const last = sessions[index]!;
  const ended = nowMinutes >= toMinutes(last.start_time) + last.duration_minutes;
  return { index, done: ended && index === sessions.length - 1 };
}

/** "3 × 10 reps · 60s rest" — runs of identical sets collapse into one line. */
function setLines(sets: TvSession["segments"][number]["exercises"][number]["sets"]): string[] {
  const lines: { text: string; count: number }[] = [];
  for (const set of sets) {
    const text = [
      describeSet(set.target, toIntensityType(set.intensity_type), set.intensity_value),
      set.rest_seconds ? `${set.rest_seconds}s rest` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const previous = lines[lines.length - 1];
    if (previous && previous.text === text) previous.count++;
    else lines.push({ text, count: 1 });
  }
  return lines.map(({ text, count }) => {
    const sets = `${count} ${count === 1 ? "set" : "sets"}`;
    if (!text) return sets;
    return count === 1 ? text : `${count} × ${text}`;
  });
}

export function TvBoard({ sessions, loadedAt }: { sessions: TvSession[]; loadedAt: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 15_000);
    // Picks up Guy's edits, and the new day's classes after midnight. If the
    // Wi-Fi is down this quietly fails and the board keeps what it had.
    const reload = setInterval(() => router.refresh(), RELOAD_EVERY_MS);
    return () => {
      clearInterval(tick);
      clearInterval(reload);
    };
  }, [router]);

  const { minutes: nowMinutes, clock } = londonNow(now);
  const { index, done } = sessions.length > 0 ? pickSession(sessions, nowMinutes) : { index: -1, done: false };
  const session = index >= 0 && !done ? sessions[index]! : null;
  const next = index >= 0 && !done ? sessions[index + 1] : undefined;

  const updated = londonNow(new Date(loadedAt)).clock;
  const startMinutes = session ? toMinutes(session.start_time) : 0;
  const isOn = session ? nowMinutes >= startMinutes : false;

  return (
    <main className="h-screen w-screen overflow-hidden bg-black text-blueprint-ink flex flex-col p-[2vw] gap-[1.5vw]" style={{ fontSize: "1.6vw" }}>
      <header className="flex items-start justify-between gap-[2vw] shrink-0">
        <div className="min-w-0">
          <p className="fb-eyebrow" style={{ fontSize: "0.8em" }}>
            Fitness Blueprint{session ? (isOn ? " · Now" : " · Up next") : ""}
          </p>
          <h1 className="font-semibold leading-tight truncate" style={{ fontSize: "2.6em" }}>
            {session ? session.class_name : done ? "That's it for today" : "No classes today"}
          </h1>
          {session && (
            <p className="text-blueprint-muted" style={{ fontSize: "1.1em" }}>
              {hhmm(startMinutes)}–{hhmm(startMinutes + session.duration_minutes)}
              {session.coach_first_name ? ` · Coach ${session.coach_first_name}` : ""}
            </p>
          )}
        </div>
        <p className="font-mono font-semibold tabular-nums shrink-0" style={{ fontSize: "2.6em" }}>
          {clock}
        </p>
      </header>

      {/* Keyed so it starts from full size again for each class and each reload. */}
      <FitToScreen key={`${session?.id ?? "none"}-${loadedAt}`}>
        {session &&
          (session.segments.length === 0 ? (
            <p className="text-blueprint-muted" style={{ fontSize: "1.4em" }}>
              The workout for this class hasn&apos;t been posted yet.
            </p>
          ) : (
            <div
              className="grid gap-[1.2vw] items-start"
              style={{ gridTemplateColumns: `repeat(${Math.min(session.segments.length, 4)}, minmax(0, 1fr))` }}
            >
              {session.segments.map((segment, segIndex) => (
                <section
                  key={segIndex}
                  className="rounded-lg overflow-hidden border border-blueprint-line bg-blueprint-raised/40"
                  style={{ borderTop: `0.35vw solid ${SEGMENT_TYPE_ACCENT[segment.type]}` }}
                >
                  <h2 className="px-[1vw] py-[0.6vw] font-semibold bg-blueprint-raised/60" style={{ fontSize: "1.1em" }}>
                    {segmentDisplayLabel(session.segments, segIndex)}
                    {segment.type !== "warmup" && segment.type !== "cooldown" && segment.type !== "straight" ? (
                      <span className="text-blueprint-muted font-normal"> · {segment.type === "circuit" ? "Circuit" : "Finisher"}</span>
                    ) : null}
                  </h2>
                  {segment.text_content ? (
                    <p className="px-[1vw] py-[0.8vw] font-medium leading-snug whitespace-pre-line">{segment.text_content}</p>
                  ) : (
                  <ul className="px-[1vw] py-[0.8vw] space-y-[0.8vw]">
                    {segment.exercises.map((exercise, exIndex) => (
                      <li key={exIndex}>
                        <p className="font-medium leading-snug">
                          {exercise.name}
                          {exercise.each_side ? <span className="text-blueprint-muted font-normal"> (each side)</span> : null}
                        </p>
                        {exercise.tempo?.trim() ? (
                          <p className="text-blueprint-muted" style={{ fontSize: "0.8em" }}>
                            Tempo {exercise.tempo.trim()}
                          </p>
                        ) : null}
                        {setLines(exercise.sets).map((line, i) => (
                          <p key={i} className="text-blueprint-muted" style={{ fontSize: "0.85em" }}>
                            {line}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                  )}
                </section>
              ))}
            </div>
          ))}
      </FitToScreen>

      <footer className="flex items-center justify-between gap-[2vw] shrink-0 text-blueprint-muted" style={{ fontSize: "0.9em" }}>
        <p className="truncate">
          {next ? (
            <>
              Next: <span className="text-blueprint-ink">{hhmm(toMinutes(next.start_time))} {next.class_name}</span>
            </>
          ) : session ? (
            "Last class of the day"
          ) : null}
        </p>
        <p className="shrink-0" style={{ fontSize: "0.8em" }}>
          Updated {updated}
        </p>
      </footer>
    </main>
  );
}

/** A TV can't scroll: long workouts step the text down until they fit. */
function FitToScreen({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const box = ref.current;
    if (box && box.scrollHeight > box.clientHeight + 1 && scale > 0.45) {
      setScale((s) => Math.round((s - 0.05) * 100) / 100);
    }
  }, [scale]);

  return (
    <div ref={ref} className="flex-1 min-h-0 overflow-hidden" style={{ fontSize: `${scale}em` }}>
      {children}
    </div>
  );
}
