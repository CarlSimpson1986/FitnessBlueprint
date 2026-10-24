/** The length caps on events (0067), checked before insert for a clear message. */
export function eventTooLong(title: string, description: string, location: string): string | null {
  if (title.trim().length > 120) return "Keep the title under 120 characters.";
  if (description.trim().length > 2000) return "Keep the description under 2,000 characters.";
  if (location.trim().length > 200) return "Keep the location under 200 characters.";
  return null;
}
