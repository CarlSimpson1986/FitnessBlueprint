import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { writeWeeklySummary } from "./claude";

const DAY_MS = 24 * 60 * 60 * 1000;
// Below this there's nothing to find patterns in — Guy can just read them.
const MIN_NOTES = 3;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type WeeklySummary =
  | { status: "ok"; text: string; noteCount: number; averages: { class: number; effort: number; experience: number } | null }
  | { status: "too_little"; noteCount: number };

function ukDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);
}

const avg = (values: number[]) => Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

/**
 * Ted's weekly themes for the owner: the last 7 days of session feedback
 * comments and Sunday check-ins, summarised by Claude into patterns with
 * counts. Rating averages are worked out here, not by the model, so the
 * numbers are exact. Names are never sent — only what was said, and about
 * which class.
 *
 * Takes either the owner's RLS client (the Feedback page — "owner reads
 * all feedback", 0002; check-ins are is_coach_or_owner(), 0028) or the
 * admin client (the Monday cron, which has no session).
 */
export async function buildWeeklySummary(supabase: SupabaseClient<Database>, now = new Date()): Promise<WeeklySummary> {
  const since = new Date(now.getTime() - 7 * DAY_MS);

  const [{ data: feedback }, { data: checkins }] = await Promise.all([
    supabase
      .from("session_feedback")
      .select("session_id, class_rating, effort_rating, experience_rating, comment")
      .gte("created_at", since.toISOString()),
    supabase
      .from("weekly_checkins")
      .select("energy, sleep, nutrition, win, struggle, note_for_coach")
      .gte("week_of", ukDateKey(since)),
  ]);

  const feedbackRows = feedback ?? [];
  const sessionIds = [...new Set(feedbackRows.map((f) => f.session_id))];
  const { data: sessions } = sessionIds.length
    ? await supabase.from("sessions").select("id, session_date, start_time, template_id").in("id", sessionIds)
    : { data: [] };
  const templateIds = [...new Set((sessions ?? []).map((s) => s.template_id))];
  const { data: templates } = templateIds.length
    ? await supabase.from("session_templates").select("id, name").in("id", templateIds)
    : { data: [] };
  const className = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const sessionLabel = new Map(
    (sessions ?? []).map((s) => [
      s.id,
      `${className.get(s.template_id) ?? "Session"}, ${WEEKDAY[new Date(`${s.session_date}T12:00:00Z`).getUTCDay()]} ${s.start_time.slice(0, 5)}`,
    ])
  );

  const notes: string[] = [];
  for (const f of feedbackRows) {
    if (!f.comment?.trim()) continue;
    notes.push(
      `Feedback on ${sessionLabel.get(f.session_id) ?? "a session"} (class ${f.class_rating}/5, effort ${f.effort_rating}/5, experience ${f.experience_rating}/5): "${f.comment.trim()}"`
    );
  }
  for (const c of checkins ?? []) {
    const parts = [`energy ${c.energy}/5, sleep ${c.sleep}/5, nutrition ${c.nutrition}/5`];
    if (c.win?.trim()) parts.push(`win: "${c.win.trim()}"`);
    if (c.struggle?.trim()) parts.push(`struggle: "${c.struggle.trim()}"`);
    if (c.note_for_coach?.trim()) parts.push(`note for coach: "${c.note_for_coach.trim()}"`);
    notes.push(`Weekly check-in — ${parts.join("; ")}`);
  }

  if (notes.length < MIN_NOTES) {
    return { status: "too_little", noteCount: notes.length };
  }

  const averages = feedbackRows.length
    ? {
        class: avg(feedbackRows.map((f) => f.class_rating)),
        effort: avg(feedbackRows.map((f) => f.effort_rating)),
        experience: avg(feedbackRows.map((f) => f.experience_rating)),
      }
    : null;

  const text = await writeWeeklySummary(notes);
  return { status: "ok", text, noteCount: notes.length, averages };
}
