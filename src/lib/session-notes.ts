/**
 * Quick tags a coach taps after a session (spec, "Today"). Anything more
 * specific — "progressed deadlift", which shoulder — goes in the text.
 * Fixed here rather than in a table; ask Guy before changing the list.
 */
export const SESSION_NOTE_TAGS = [
  "Great session",
  "Progressed",
  "Struggled",
  "Form to work on",
  "Niggle / injury",
  "Low energy",
  "Check in with them",
] as const;

export type SessionNoteTag = (typeof SESSION_NOTE_TAGS)[number];

export const SESSION_NOTE_MAX_LENGTH = 500;

export type SessionNote = {
  tags: string[];
  text: string | null;
  /** UK date of the session the note is from (for "last time" on the roster). */
  sessionDate?: string;
};
