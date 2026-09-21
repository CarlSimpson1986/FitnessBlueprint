"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveGoal, type GoalType } from "./goals-actions";

type TypeOption = { value: GoalType; label: string };
const TYPE_OPTIONS: TypeOption[] = [
  { value: "lose_weight", label: "Lose weight" },
  { value: "build_strength", label: "Build strength" },
  { value: "general_fitness", label: "General fitness" },
  { value: "event_prep", label: "Event prep" },
];

const METRIC_OPTIONS = ["Weight (kg)", "Waist (cm)", "Body fat %", "Deadlift (kg)", "Total lifted (kg)", "Sessions/week"];

type Step =
  | "type"
  | "metric"
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

function sanityCheck(
  value: string,
  metric: string,
  baseline: number | null
): { unrealistic: boolean; note: string } {
  const numMatch = value.match(/[\d.]+/);
  const num = numMatch ? parseFloat(numMatch[0]) : null;
  const mentionsStone = /stone/i.test(value);

  if (mentionsStone && num) {
    const kg = num * 6.35;
    if (kg > 6) {
      return {
        unrealistic: true,
        note: `That's ${kg.toFixed(1)}kg in 6 weeks — that's not a pace I'd back safely. Safe fat loss tops out around 1kg a week, so more like ${Math.max(0, kg - (kg - 6)).toFixed(0)}kg in 6 weeks would be realistic.`,
      };
    }
  } else if (baseline !== null && num !== null && (metric === "Weight (kg)" || metric === "Body fat %")) {
    const diff = baseline - num;
    const perWeek = diff / 6;
    const cap = metric === "Weight (kg)" ? 1 : 0.5;
    if (perWeek > cap) {
      const suggested = (baseline - cap * 6).toFixed(1);
      return {
        unrealistic: true,
        note: `That's ${diff.toFixed(1)}${metric === "Weight (kg)" ? "kg" : "%"} in 6 weeks — more than I'd want to see happen that fast. Something like ${suggested} would still be a strong 6 weeks and won't burn you out.`,
      };
    }
  }

  return { unrealistic: false, note: "" };
}

function TedBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="fb-card mr-8 flex items-start gap-2">
      <Image
        src="/coach-ted-avatar.png"
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

export function GoalWizard({
  mode,
  previousGoal,
  weightBaseline,
  bodyFatBaseline,
  habitOptions,
}: {
  mode: "full" | "checkin";
  previousGoal?: { type: GoalType; metric: string; longTarget: string; longDate: string | null };
  weightBaseline: number | null;
  bodyFatBaseline: number | null;
  habitOptions: { id: string; name: string }[];
}) {
  const [step, setStep] = useState<Step>(mode === "checkin" ? "microTarget" : "type");
  const [messages, setMessages] = useState<WizardMessage[]>([
    {
      id: "intro",
      from: "ted",
      text:
        mode === "checkin"
          ? "Your 6-week check-in's here. Let's set the next target."
          : "Let's set a goal. What are you working towards?",
    },
    ...(mode === "checkin"
      ? [{ id: "intro-2", from: "ted" as const, text: "What could you realistically hit in the next 6 weeks?" }]
      : []),
  ]);

  const [type, setType] = useState<GoalType>(previousGoal?.type ?? "general_fitness");
  const [metric, setMetric] = useState(previousGoal?.metric ?? "");
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

  function pickType(option: TypeOption) {
    setType(option.value);
    say("user", option.label);
    say("ted", "Got it. What should we track it with?");
    setStep("metric");
  }

  function pickMetric(value: string) {
    setMetric(value);
    say("user", value);
    say("ted", "What's the big-picture target — the ultimate number you're aiming for, whenever you get there?");
    setStep("longTarget");
  }

  function submitLongTarget() {
    if (!textInput.trim()) return;
    setLongTarget(textInput.trim());
    say("user", textInput.trim());
    setTextInput("");
    say("ted", "Roughly when, big picture — no pressure, just a rough date?");
    setStep("longDate");
  }

  function submitLongDate() {
    if (!textInput) return;
    setLongDate(textInput);
    say("user", fmtDate(new Date(`${textInput}T00:00:00`)));
    setTextInput("");
    say(
      "ted",
      "Here's the thing though — we're not going to stare at that far-off number every day. Let's just focus on the next 6 weeks. What could you realistically hit by then?"
    );
    setStep("microTarget");
  }

  function submitMicroTarget() {
    if (!textInput.trim()) return;
    const value = textInput.trim();
    const baseline = metric === "Weight (kg)" ? weightBaseline : metric === "Body fat %" ? bodyFatBaseline : null;
    const result = sanityCheck(value, metric, baseline);

    say("user", value);
    setTextInput("");

    if (result.unrealistic) {
      say("ted", `${result.note} Want to try a different number?`);
      setRetryNote(result.note);
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
              className="text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-1.5 hover:border-blueprint-accent hover:text-blueprint-ink transition"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {step === "metric" && (
        <div className="flex flex-wrap gap-1.5">
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => pickMetric(option)}
              className="text-xs font-medium text-blueprint-muted border border-blueprint-line rounded-lg px-3 py-1.5 hover:border-blueprint-accent hover:text-blueprint-ink transition"
            >
              {option}
            </button>
          ))}
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
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={submitLongDate} disabled={!textInput} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
        </div>
      )}

      {step === "microTarget" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={retryNote ? "New 6-week target" : "e.g. 74"}
            className="flex-1 bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent"
          />
          <button type="button" onClick={submitMicroTarget} disabled={!textInput.trim()} className="fb-btn-primary disabled:opacity-50">
            Send
          </button>
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
