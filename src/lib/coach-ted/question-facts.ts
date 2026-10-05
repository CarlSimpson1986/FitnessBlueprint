import { describeDay } from "./member-context";

/**
 * Sums from the member's own message, worked out in code so Ted (Haiku)
 * doesn't do them. Same reasoning as the protein range and safe loss rate
 * in member-context.ts: the 2026-10-05 eval had Haiku call 1 December
 * "0.17kg a week" away and tell a member 10kg in 8 weeks was comfortable.
 *
 * Finds a date ("1 December 2026", "1st Dec", "December 1", "in 10 days",
 * "in 6 weeks") and, if they also give a weight to lose ("lose 10kg"),
 * the weekly rate that would take, compared with their safe rate from the
 * profile. Anything it can't read confidently is left out.
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for a moment, in UK time. */
function ukDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function addDays(isoDate: string, days: number) {
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

/** The date they mention, as YYYY-MM-DD, or null. Dates without a year are the next one coming. */
export function findDate(question: string, today: Date): string | null {
  const text = question.toLowerCase();
  const todayIso = ukDate(today);

  const relative = text.match(/\b(?:in|within|over|for)\s+(?:the\s+next\s+)?(\d{1,3})\s*(day|week|month)s?\b/);
  if (relative) {
    const n = Number(relative[1]);
    const days = relative[2] === "day" ? n : relative[2] === "week" ? n * 7 : Math.round(n * 30.44);
    return addDays(todayIso, days);
  }

  const month = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
  const dayFirst = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${month}(?:,?\\s+(\\d{4}))?\\b`));
  const monthFirst = text.match(new RegExp(`\\b${month}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`));
  let day: number, monthIndex: number, year: number | null;
  if (dayFirst) {
    day = Number(dayFirst[1]);
    monthIndex = MONTHS.indexOf(dayFirst[2]!);
    year = dayFirst[3] ? Number(dayFirst[3]) : null;
  } else if (monthFirst) {
    monthIndex = MONTHS.indexOf(monthFirst[1]!);
    day = Number(monthFirst[2]);
    year = monthFirst[3] ? Number(monthFirst[3]) : null;
  } else {
    return null;
  }
  if (day < 1 || day > 31 || monthIndex < 0) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const build = (y: number) => `${y}-${pad(monthIndex + 1)}-${pad(day)}`;
  const thisYear = Number(todayIso.slice(0, 4));
  let iso = build(year ?? thisYear);
  if (year === null && iso < todayIso) iso = build(thisYear + 1);
  // Reject impossible dates like 31 Feb (Date rolls them over).
  if (new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

/** Kilos they say they want to lose ("lose 10kg", "drop 5 kilos"), or null. */
export function findKgToLose(question: string): number | null {
  const m = question
    .toLowerCase()
    .match(/\b(?:lose|losing|lost|drop|dropping|shed|shift|get rid of)\s+(?:about\s+|around\s+|another\s+)?(\d{1,2}(?:\.\d)?)\s*(?:kg|kgs|kilos?|kilograms?)\b/);
  return m ? Number(m[1]) : null;
}

/** "0.4-0.8kg a week" from the profile's safe-rate line, as numbers. */
function safeRateFromProfile(profile: string): [number, number] | null {
  const m = profile.match(/safe rate for them[^:]*:\s*([\d.]+)-([\d.]+)kg a week/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Lines for Ted's context, or [] when the message has nothing to work out. */
export function questionFacts(question: string, profile: string, today: Date): string[] {
  const date = findDate(question, today);
  if (!date) return [];
  const days = daysBetween(ukDate(today), date);
  if (days <= 0) return [];

  const weeks = days >= 14 ? ` (${days} days is about ${Math.round(days / 7)} weeks)` : "";
  const lines = [`The date in their message: ${describeDay(date, today)}${weeks}`];

  const kg = findKgToLose(question);
  const safe = safeRateFromProfile(profile);
  if (kg && safe) {
    const perWeek = Math.round((kg / (days / 7)) * 10) / 10;
    const rate = `their safe rate of ${safe[0]}-${safe[1]}kg a week`;
    const verdict =
      perWeek > safe[1]
        ? `faster than ${rate}, so don't plan for it`
        : perWeek < safe[0]
          ? `slower than ${rate}, which is fine`
          : `within ${rate}`;
    lines.push(`Losing ${kg}kg by then would mean about ${perWeek}kg a week: ${verdict}`);
  }
  return lines;
}
