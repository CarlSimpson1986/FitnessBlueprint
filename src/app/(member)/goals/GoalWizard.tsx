"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveGoal, type GoalType } from "./goals-actions";
import {
  checkTarget,
  guidanceFor,
  suggestedDates,
  suggestedTargets,
  timelineFor,
  type Guidance,
} from "@/lib/goal-guidance";
import {
  SESSIONS_PER_WEEK,
  TOTAL_LIFTED,
  formatValue,
  isBodyGoalMetric,
  parseLiftMetric,
  valueFor,
  type BodyGoalMetric,
  type LiftBest,
} from "@/lib/goal-tracking";

type TypeOption = { value: GoalType; label: string };
const TYPE_OPTIONS: TypeOption[] = [
  { value: "lose_weight", label: "Lose fat" },
  { value: "build_muscle", label: "Build muscle" },
  { value: "build_strength", label: "Get stronger" },
  { value: "general_fitness", label: "General fitness" },
  { value: "event_prep", label: "Event prep" },
];

const SOMETHING_ELSE = "Something else";

// What each goal is tracked by. Strength goals skip this — the member picks
// a lift instead. Every type ends with "Something else" (their own words).
const METRICS_BY_TYPE: Record<Exclude<GoalType, "build_strength">, string[]> = {
  lose_weight: ["Weight (kg)", "Waist (cm)", "Hips (cm)", "Body fat %", SOMETHING_ELSE],
  // Weight up with the waist holding steady is what lean gain looks like.
  build_muscle: ["Weight (kg)", "Waist (cm)", "Body fat %", SOMETHING_ELSE],
  general_fitness: [SESSIONS_PER_WEEK, TOTAL_LIFTED, "Weight (kg)", "Waist (cm)", "Hips (cm)", SOMETHING_ELSE],
  event_prep: [SESSIONS_PER_WEEK, TOTAL_LIFTED, "Weight (kg)", SOMETHING_ELSE],
};

// The big lifts in plain words, for members who don't know the names yet.
// Hidden when they've already logged something matching (their own name
// for it is listed instead, with their best).
const COMMON_LIFTS = [
  { label: "Squat — legs", metric: "Squat (kg)", match: "squat" },
  { label: "Deadlift — lifting off the floor", metric: "Deadlift (kg)", match: "deadlift" },
  { label: "Bench press — chest", metric: "Bench press (kg)", match: "bench" },
  { label: "Overhead press — shoulders", metric: "Overhead press (kg)", match: "overhead" },
  { label: "Pull-ups — back", metric: "Pull-ups (reps)", match: "pull" },
];

function metricOptions(type: Exclude<GoalType, "build_strength">, bodyMetricsOn: boolean) {
  // Measured on the body — hidden for members who've opted out (0043).
  return bodyMetricsOn ? METRICS_BY_TYPE[type] : METRICS_BY_TYPE[type].filter((m) => !isBodyGoalMetric(m));
}

/** Evidence-based 6-week range for this goal, when there's one to give. */
function goalGuidance(type: GoalType, metric: string, baseline: number | null): Guidance | null {
  if (type !== "lose_weight" && type !== "build_muscle") return null;
  if (metric !== "Weight (kg)" && metric !== "Body fat %") return null;
  if (baseline === null) return null;
  return guidanceFor(type === "lose_weight" ? "lose_fat" : "build_muscle", metric, baseline);
}

/** What Ted says when we already have the member's number. */
function nowLine(metric: string, value: number) {
  const lift = parseLiftMetric(metric);
  if (lift) {
    return lift.unit === "kg"
      ? `Your best ${lift.name} so far is ${formatValue(value, metric)} — that's your starting point.`
      : `Your best so far is ${value} ${lift.name} in one go — that's your starting point.`;
  }
  if (metric === TOTAL_LIFTED) {
    return `You've lifted ${formatValue(value, metric)} in total over the last 7 days. I'll track that week to week.`;
  }
  if (metric === SESSIONS_PER_WEEK) return `You've done ${value} session${value === 1 ? "" : "s"} in the last 7 days.`;
  return `Your last ${metric.replace(/ \(.*\)$/, "").toLowerCase()} on record is ${formatValue(value, metric)}.`;
}

/** What Ted asks when we don't have the member's number. Always skippable. */
function baselinePrompt(metric: string) {
  const lift = parseLiftMetric(metric);
  if (lift) {
    return lift.unit === "kg"
      ? `What's the most you can lift on ${lift.name} right now, in kg? A rough number's fine — skip if you've no idea.`
      : `How many ${lift.name} can you do in one go right now? Skip if you're not sure.`;
  }
  switch (metric) {
    case "Weight (kg)":
      return "What do you weigh right now, in kg? I'll use it to tell you what's realistic.";
    case "Body fat %":
      return "What's your body fat % right now? A rough number's fine — I'll use it to tell you what's realistic.";
    case "Waist (cm)":
      return "What's your waist right now, in cm? Measure round your belly button, relaxed — not sucked in.";
    case "Hips (cm)":
      return "What do your hips measure right now, in cm? Round the widest part of your bum, feet together.";
    case SESSIONS_PER_WEEK:
      return "How many sessions a week are you doing at the moment?";
    case TOTAL_LIFTED:
      return "I'll track this from your logged sessions — log a few and it'll fill in. Skip for now.";
    default:
      return "Where are you at with that right now? Skip if you're not sure.";
  }
}

type Step =
  | "type"
  | "metric"
  | "customMetric"
  | "exercise"
  | "baseline"
  | "longTarget"
  | "longDate"
  | "microTarget"
  | "barriers"
  | "habits"
  | "why"
  | "done";

type WizardMessage = { id: string; from: "ted" | "user"; text: string };

function addWeeks(date: Date, weeks: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

function fmtDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function TedBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="fb-card mr-8 flex items-start gap-2">
      <Image
        src="/coach-ted.png"
        alt=""
        width={20}
        height={20}
        className="rounded-full object-cover mt-0.5 shrink-0"
      />
      <p className="text-sm text-blueprint-ink whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="fb-card-accent ml-8">
      <p className="text-sm text-blueprint-ink">{children}</p>
    </div>
  );
}

const CHIP =
  "text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-1.5 hover:border-blueprint-accent hover:text-blueprint-ink transition";
const PICK_CHIP =
  "text-xs font-medium text-blueprint-ink border border-blueprint-accent rounded-lg px-3 py-1.5 hover:bg-blueprint-accent/15 transition";

export function GoalWizard({
  mode,
  previousGoal,
  currentValues,
  liftOptions,
  habitOptions,
  bodyMetricsOn,
}: {
  mode: "full" | "checkin";
  previousGoal?: { type: GoalType; metric: string; longTarget: string; longDate: string | null };
  /** The member's latest number per metric (goal-tracking.ts currentValues). */
  currentValues: Record<string, number>;
  /** Lifts they've logged, most recent first, with their best. */
  liftOptions: LiftBest[];
  habitOptions: { id: string; name: string }[];
  bodyMetricsOn: boolean;
}) {
  // A check-in starts from where they are now: their number if we have it,
  // otherwise Ted asks for it.
  const checkinNow = mode === "checkin" && previousGoal ? valueFor(currentValues, previousGoal.metric) : null;

  const [step, setStep] = useState<Step>(
    mode === "checkin" ? (checkinNow !== null ? "microTarget" : "baseline") : "type"
  );
  const [messages, setMessages] = useState<WizardMessage[]>(() => {
    if (mode !== "checkin" || !previousGoal) {
      return [{ id: "intro", from: "ted", text: "Let's set a goal. What are you working towards?" }];
    }
    const intro: WizardMessage = { id: "intro", from: "ted", text: "Your 6-week check-in's here. Let's set the next target." };
    if (checkinNow === null) return [intro, { id: "intro-2", from: "ted", text: baselinePrompt(previousGoal.metric) }];
    const g = goalGuidance(previousGoal.type, previousGoal.metric, checkinNow);
    return [
      intro,
      { id: "intro-2", from: "ted", text: nowLine(previousGoal.metric, checkinNow) },
      {
        id: "intro-3",
        from: "ted",
        text: g ? `${g.explanation} Pick one below or type your own.` : "What could you realistically hit in the next 6 weeks?",
      },
    ];
  });

  const [type, setType] = useState<GoalType>(previousGoal?.type ?? "general_fitness");
  const [metric, setMetric] = useState(previousGoal?.metric ?? "");
  const [startValue, setStartValue] = useState<number | null>(checkinNow);
  // A body measurement the member typed in because we had none on record —
  // saved to body_metrics with the goal so Progress has it too.
  const [typedBody, setTypedBody] = useState<{ metric: BodyGoalMetric; value: number } | null>(null);
  const [longTarget, setLongTarget] = useState(previousGoal?.longTarget ?? "");
  const [longDate, setLongDate] = useState(previousGoal?.longDate ?? "");
  const [microTarget, setMicroTarget] = useState("");
  const [barriers, setBarriers] = useState("");
  const [habits, setHabits] = useState<string[]>([]);
  const [textInput, setTextInput] = useState("");
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [customHabit, setCustomHabit] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function say(from: WizardMessage["from"], text: string) {
    setMessages((prev) => [...prev, { id: `${from}-${prev.length}`, from, text }]);
  }

  function currentGuidance(): { baseline: number; g: Guidance } | null {
    const g = goalGuidance(type, metric, startValue);
    return g && startValue !== null ? { baseline: startValue, g } : null;
  }

  /** Research-based time to the big-picture target (weight / body fat only). */
  function timelineTo(targetText: string) {
    if (type !== "lose_weight" && type !== "build_muscle") return null;
    if (metric !== "Weight (kg)" && metric !== "Body fat %") return null;
    const target = parseFloat(targetText);
    if (startValue === null || !Number.isFinite(target)) return null;
    return timelineFor(type === "lose_weight" ? "lose_fat" : "build_muscle", metric, startValue, target);
  }

  function pickType(option: TypeOption) {
    setType(option.value);
    say("user", option.label);
    if (option.value === "build_strength") {
      say(
        "ted",
        "Which lift do you want to get stronger at? Don't worry if you don't know the names — pick one below, or go for stronger overall."
      );
      setStep("exercise");
      return;
    }
    say("ted", "Got it. What should we track it with?");
    setStep("metric");
  }

  /** The metric's settled: start from their number, or ask for it. */
  function chooseMetric(chosen: string, shownAs: string) {
    say("user", shownAs);
    setMetric(chosen);
    const now = valueFor(currentValues, chosen);
    if (now !== null) {
      setStartValue(now);
      say("ted", nowLine(chosen, now));
      askLongTarget(chosen);
      return;
    }
    say("ted", baselinePrompt(chosen));
    setStep("baseline");
  }

  function pickMetric(value: string) {
    if (value === SOMETHING_ELSE) {
      say("user", value);
      say("ted", "What do you want to track? Name it and the unit — e.g. 5k time (min).");
      setStep("customMetric");
      return;
    }
    chooseMetric(value, value);
  }

  function submitCustomMetric() {
    const value = textInput.trim();
    if (!value) return;
    setTextInput("");
    chooseMetric(value, value);
  }

  function submitExercise() {
    const lift = textInput.trim();
    if (!lift) return;
    setTextInput("");
    // "Pull-ups (reps)" keeps its unit; a bare name is a weight in kg.
    chooseMetric(/\([^)]+\)$/.test(lift) ? lift : `${lift} (kg)`, lift);
  }

  function submitBaseline(skip: boolean) {
    if (skip) {
      say("user", "Not sure");
      setStartValue(null);
    } else {
      const num = parseFloat(textInput);
      if (!Number.isFinite(num) || num < 0) return;
      setStartValue(num);
      if (isBodyGoalMetric(metric)) setTypedBody({ metric, value: num });
      say("user", formatValue(num, metric));
      setTextInput("");
    }

    if (mode === "checkin") {
      const g = skip ? null : goalGuidance(type, metric, parseFloat(textInput));
      say("ted", g ? `${g.explanation} Pick one below or type your own.` : "What could you realistically hit in the next 6 weeks?");
      setStep("microTarget");
      return;
    }
    askLongTarget(metric);
  }

  function askLongTarget(forMetric: string) {
    const lift = parseLiftMetric(forMetric);
    say(
      "ted",
      lift
        ? `Strength comes quickest early on — newer lifters can often add weight most weeks, experienced lifters a lot slower. What's the big-picture ${lift.name} number you're after${lift.unit === "kg" ? ", in kg" : ""}?`
        : "What's the big-picture target — the ultimate number you're aiming for, whenever you get there?"
    );
    setStep("longTarget");
  }

  function submitLongTarget() {
    const value = textInput.trim();
    if (!value) return;
    setLongTarget(value);
    say("user", value);
    setTextInput("");

    const timeline = timelineTo(value);
    say(
      "ted",
      timeline
        ? `${timeline.explanation} about ${timeline.fastWeeks}–${timeline.slowWeeks} weeks. Pick a date below, or set your own.`
        : "Roughly when, big picture — no pressure, just a rough date?"
    );
    setStep("longDate");
  }

  function submitLongDate(picked?: string) {
    const value = picked ?? textInput;
    if (!value) return;
    setLongDate(value);
    say("user", fmtDate(new Date(`${value}T00:00:00`)));
    setTextInput("");
    say(
      "ted",
      "Here's the thing though — we're not going to stare at that far-off number every day. Let's just focus on the next 6 weeks."
    );
    const guided = currentGuidance();
    say(
      "ted",
      guided
        ? `${guided.g.explanation} Pick one below or type your own.`
        : "What could you realistically hit by then?"
    );
    setStep("microTarget");
  }

  function submitMicroTarget(picked?: string) {
    const value = (picked ?? textInput).trim();
    if (!value) return;

    say("user", value);
    setTextInput("");

    const guided = currentGuidance();
    const num = parseFloat(value);
    const note = guided && Number.isFinite(num) ? checkTarget(guided.baseline, num, guided.g) : null;
    if (note) {
      say("ted", `${note} Want to try a different number?`);
      setRetryNote(note);
      return;
    }

    setRetryNote(null);
    setMicroTarget(value);
    say("ted", "What's most likely to get in the way of you hitting that, if you're honest?");
    setStep("barriers");
  }

  function submitBarriers() {
    if (!textInput.trim()) return;
    setBarriers(textInput.trim());
    say("user", textInput.trim());
    setTextInput("");
    say("ted", "Given that, what daily habits do you need to lock in to actually get there? Pick as many as you want.");
    setStep("habits");
  }

  function toggleHabit(name: string) {
    setHabits((prev) => (prev.includes(name) ? prev.filter((h) => h !== name) : [...prev, name]));
  }

  function addCustomHabit() {
    const value = customHabit.trim();
    if (!value) return;
    setHabits((prev) => [...prev, value]);
    setCustomHabit("");
  }

  function finishHabits() {
    if (habits.length === 0) return;
    say("user", habits.join(", "));
    say("ted", "Last one — why does this matter to you? Helps your coach get behind it too. Skip if you'd rather not say.");
    setStep("why");
  }

  function submitWhy(skip: boolean) {
    const value = skip ? "" : textInput.trim();
    if (!skip) say("user", value || "(skipped)");
    setTextInput("");
    handleSave(value);
  }

  function handleSave(whyValue: string) {
    setError(null);
    const checkinDate = toIsoDate(addWeeks(new Date(), 6));

    startTransition(async () => {
      const result = await saveGoal({
        type,
        metric,
        longTarget,
        longDate: longDate || null,
        microTarget,
        checkinDate,
        barriers: barriers || null,
        habits,
        why: whyValue || null,
        startValue,
        bodyBaseline: typedBody,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      say(
        "ted",
        `Sorted — 6-week target: ${metric} ${microTarget} by ${fmtDate(new Date(`${checkinDate}T00:00:00`))}. I'll check back in with you then. Your coach can see all of this too.`
      );
      setStep("done");
    });
  }

  const loggedLifts = liftOptions.slice(0, 6);
  const commonLifts = COMMON_LIFTS.filter((c) => !liftOptions.some((l) => l.name.toLowerCase().includes(c.match)));
  const timeline = step === "longDate" ? timelineTo(longTarget) : null;

  return (
    <div>
      <div className="space-y-3 mb-4">
        {messages.map((m) =>
          m.from === "ted" ? <TedBubble key={m.id}>{m.text}</TedBubble> : <UserBubble key={m.id}>{m.text}</UserBubble>
        )}
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {step === "type" && (
        <div className="flex flex-wrap gap-1.5">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => pickType(option)}
              className={CHIP}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {step === "metric" && (
        <div className="flex flex-wrap gap-1.5">
          {(type === "build_strength" ? [] : metricOptions(type, bodyMetricsOn)).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => pickMetric(option)}
              className={CHIP}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {step === "exercise" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {loggedLifts.map((lift) => {
              const liftMetric = lift.bestKg !== null ? `${lift.name} (kg)` : `${lift.name} (reps)`;
              const best = lift.bestKg !== null ? `${lift.bestKg}kg` : `${lift.bestReps} reps`;
              return (
                <button key={lift.name} type="button" onClick={() => chooseMetric(liftMetric, lift.name)} className={PICK_CHIP}>
                  {lift.name} · best {best}
                </button>
              );
            })}
            {commonLifts.map((c) => (
              <button key={c.metric} type="button" onClick={() => chooseMetric(c.metric, c.label)} className={CHIP}>
                {c.label}
              </button>
            ))}
            <button type="button" onClick={() => chooseMetric(TOTAL_LIFTED, "Just stronger overall")} className={CHIP}>
              Not sure — just stronger overall
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Or type one, e.g. Leg press"
              className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
            />
            <button type="button" onClick={submitExercise} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
              Send
            </button>
          </div>
        </div>
      )}

      {step === "customMetric" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="e.g. 5k time (min)"
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={submitCustomMetric} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
        </div>
      )}

      {step === "baseline" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="e.g. 82"
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={() => submitBaseline(false)} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
          <button type="button" onClick={() => submitBaseline(true)} className="text-xs text-blueprint-muted hover:text-blueprint-accent">
            Skip
          </button>
        </div>
      )}

      {step === "longTarget" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="e.g. 70"
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={submitLongTarget} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
        </div>
      )}

      {step === "longDate" && (
        <div className="space-y-2">
          {timeline && (
            <div className="flex flex-wrap gap-1.5">
              {suggestedDates(timeline, new Date()).map((d) => (
                <button key={d.label} type="button" onClick={() => submitLongDate(toIsoDate(d.date))} className={PICK_CHIP}>
                  {d.label}: {fmtDate(d.date)}
                </button>
              ))}
            </div>
          )}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={() => submitLongDate()} disabled={!textInput} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
        </div>
        </div>
      )}

      {step === "microTarget" && (
        <div className="space-y-2">
          {(() => {
            const guided = currentGuidance();
            if (!guided) return null;
            const unit = guided.g.unit === "kg" ? "kg" : "%";
            return (
              <div className="flex flex-wrap gap-1.5">
                {suggestedTargets(guided.baseline, guided.g).map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() => submitMicroTarget(String(t.value))}
                    className={PICK_CHIP}
                  >
                    {t.label}: {t.value}
                    {unit}
                  </button>
                ))}
              </div>
            );
          })()}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder={retryNote ? "New 6-week target" : "e.g. 74"}
              className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
            />
            <button type="button" onClick={() => submitMicroTarget()} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
              Send
            </button>
          </div>
        </div>
      )}

      {step === "barriers" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="e.g. work travel, weekends"
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={submitBarriers} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
        </div>
      )}

      {step === "habits" && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {habitOptions.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => toggleHabit(h.name)}
                className={
                  habits.includes(h.name)
                    ? "text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-1.5 transition"
                    : "text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-1.5 hover:border-blueprint-accent transition"
                }
              >
                {h.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customHabit}
              onChange={(e) => setCustomHabit(e.target.value)}
              placeholder="Or type your own"
              className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-3 py-2 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
            />
            <button type="button" onClick={addCustomHabit} className="fb-btn-secondary">
              Add
            </button>
          </div>
          {habits.length > 0 && (
            <p className="text-xs text-blueprint-muted">Picked: {habits.join(", ")}</p>
          )}
          <button type="button" onClick={finishHabits} disabled={habits.length === 0} className="fb-btn-primary w-full disabled:opacity-50">
            Done
          </button>
        </div>
      )}

      {step === "why" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Totally optional"
              className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
            />
            <button
              type="button"
              onClick={() => submitWhy(false)}
              disabled={!textInput.trim() || isPending}
              className="fb-btn-primary disabled:opacity-50"
            >
              {isPending ? "…" : "Send"}
            </button>
          </div>
          <button type="button" onClick={() => submitWhy(true)} disabled={isPending} className="text-xs text-blueprint-muted hover:text-blueprint-accent">
            Skip
          </button>
        </div>
      )}

      {step === "done" && (
        <Link href="/" className="fb-btn-primary block text-center">
          Back to Home
        </Link>
      )}
    </div>
  );
}
