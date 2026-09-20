export type ParsedDayPlan = { date: string; planText: string };

const DATE_LINE = /^(\d{4}-\d{2}-\d{2})\s*$/;

/**
 * Splits one pasted block of text into per-day plans. A line containing
 * only a date (YYYY-MM-DD) starts a new day; everything until the next
 * date line (or end of text) is that day's plan. Matches the owner's
 * ask for "simple pasted-text programmes rather than a movement/reps/
 * equipment picker UI" — one paste per training block, not per session.
 */
export function parseBlockText(raw: string): ParsedDayPlan[] {
  const lines = raw.split(/\r?\n/);
  const blocks: ParsedDayPlan[] = [];
  let currentDate: string | null = null;
  let currentLines: string[] = [];

  function flush() {
    if (currentDate) {
      const text = currentLines.join("\n").trim();
      if (text) {
        blocks.push({ date: currentDate, planText: text });
      }
    }
  }

  for (const line of lines) {
    const match = line.match(DATE_LINE);
    if (match) {
      flush();
      currentDate = match[1]!;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return blocks;
}
