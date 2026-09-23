"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RATING_LABELS } from "@/lib/weekly-checkin";
import { submitWeeklyCheckin } from "./actions";

type RatingKey = keyof typeof RATING_LABELS;

const RATING_QUESTIONS: { key: RatingKey; question: string }[] = [
  { key: "energy", question: "How was your energy this week?" },
  { key: "sleep", question: "How did you sleep?" },
  { key: "nutrition", question: "How was your nutrition?" },
];

const textareaClass =
  "w-full bg-blueprint-raised border border-blueprint-line rounded-lg px-4 py-3 text-sm text-blueprint-ink placeholder:text-blueprint-muted focus:outline-none focus:border-blueprint-accent";

export function CheckinForm({ firstName, lastWeightKg }: { firstName: string; lastWeightKg: number | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [ratings, setRatings] = useState<Record<RatingKey, number | null>>({
    energy: null,
    sleep: null,
    nutrition: null,
  });
  const [win, setWin] = useState("");
  const [struggle, setStruggle] = useState("");
  const [note, setNote] = useState("");

  const allRated = Object.values(ratings).every((r) => r !== null);

  function handleSubmit() {
    if (!allRated) return;
    setError(null);
    startTransition(async () => {
      const result = await submitWeeklyCheckin({
        weightKg: weight.trim() ? Number(weight) : null,
        energy: ratings.energy!,
        sleep: ratings.sleep!,
        nutrition: ratings.nutrition!,
        win,
        struggle,
        noteForCoach: note,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="fb-card flex items-start gap-3">
        <Image src="/coach-ted-avatar.png" alt="" width={32} height={32} className="rounded-full object-cover shrink-0" />
        <p className="text-sm text-blueprint-ink">
          Hey {firstName} — weekly check-in time. Takes a minute, and your coach sees it so they can
          help with whatever&apos;s getting in the way.
        </p>
      </div>

      <div>
        <p className="text-sm text-blueprint-ink font-medium mb-2">
          This week&apos;s weight <span className="text-blueprint-muted font-normal">(optional)</span>
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={lastWeightKg ? `Last time: ${lastWeightKg}` : "e.g. 82.5"}
            className={textareaClass + " max-w-[10rem]"}
          />
          <span className="text-sm text-blueprint-muted">kg</span>
        </div>
      </div>

      {RATING_QUESTIONS.map(({ key, question }) => (
        <div key={key}>
          <p className="text-sm text-blueprint-ink font-medium mb-2">{question}</p>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRatings((prev) => ({ ...prev, [key]: n }))}
                className={
                  "rounded-lg py-2.5 text-sm font-medium border transition " +
                  (ratings[key] === n
                    ? "bg-blueprint-accent text-blueprint-bg border-blueprint-accent"
                    : "border-blueprint-line text-blueprint-ink hover:border-blueprint-accent")
                }
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-blueprint-muted mt-1 px-0.5">
            <span>{RATING_LABELS[key][0]}</span>
            <span>{RATING_LABELS[key][1]}</span>
          </div>
        </div>
      ))}

      <div>
        <p className="text-sm text-blueprint-ink font-medium mb-2">Biggest win this week?</p>
        <textarea rows={2} value={win} onChange={(e) => setWin(e.target.value)} className={textareaClass} placeholder="Big or small — it counts" />
      </div>

      <div>
        <p className="text-sm text-blueprint-ink font-medium mb-2">What got in the way?</p>
        <textarea rows={2} value={struggle} onChange={(e) => setStruggle(e.target.value)} className={textareaClass} placeholder="Work, sleep, weekends…" />
      </div>

      <div>
        <p className="text-sm text-blueprint-ink font-medium mb-2">
          Anything for your coach? <span className="text-blueprint-muted font-normal">(optional)</span>
        </p>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={textareaClass} placeholder="Niggles, questions, schedule changes…" />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!allRated || isPending}
        className="fb-btn-primary w-full disabled:opacity-50"
      >
        {isPending ? "Sending…" : allRated ? "Send check-in" : "Rate all three to send"}
      </button>
    </div>
  );
}
