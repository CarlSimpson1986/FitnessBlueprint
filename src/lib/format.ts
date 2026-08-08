export function formatSessionDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatSessionTime(timeStr: string) {
  return timeStr.slice(0, 5);
}

/**
 * "YYYY-MM-DD" from a Date's LOCAL date parts — deliberately not
 * `date.toISOString().slice(0, 10)`, which converts to UTC and can
 * disagree with the date a user actually sees/clicks in their own
 * timezone (e.g. UK BST is UTC+1, so local midnight can roll back to
 * the previous UTC day). Always use this for date-picker keys so the
 * key can never drift from the displayed label.
 */
export function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
