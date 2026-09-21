// Shared between FeedbackList.tsx (Home's "Rate your last session") and
// FinishScreen.tsx (the live-logging Finish flow) — both are independent
// entry points into submitFeedback, since session_feedback has no
// member-read policy (owner-only, deliberate) so neither can ask the
// server "was this already rated?". A shared localStorage set is the only
// way one entry point can know the other already handled a session.
const STORAGE_KEY = "fb-rated-sessions";

export function loadRatedSessions(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markSessionRated(sessionId: string) {
  try {
    const ids = loadRatedSessions();
    ids.add(sessionId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // per-viewer convenience only — fine to lose this silently
  }
}
