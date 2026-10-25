// Sections a member moved on from with "Finish section" on the live screen
// (LiveLogging.tsx) without logging every set. Kept so a refresh or app
// reopen mid-workout doesn't ask them to log a skipped section again.
// Only the current workout is stored — a member does one at a time.
const STORAGE_KEY = "fb-finished-sections";

export function loadFinishedSections(sessionId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as { sessionId: string; segmentIds: string[] }) : null;
    return new Set(saved?.sessionId === sessionId ? saved.segmentIds : []);
  } catch {
    return new Set();
  }
}

export function saveFinishedSections(sessionId: string, segmentIds: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, segmentIds: Array.from(segmentIds) }));
  } catch {
    // per-viewer convenience only — fine to lose this silently
  }
}
