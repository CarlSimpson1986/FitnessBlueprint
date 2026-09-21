// Shared types for the Session -> Segment -> Exercise -> Set workout content
// model (supabase/migrations/0015_workout_content_and_logging.sql,
// 0020_exercise_sets.sql), reused by both the per-session builder
// (src/app/admin/sessions/[sessionId]/workout) and the reusable template
// library (src/app/admin/workout-templates), which share the same
// segment/exercise editing UI (src/components/SegmentExerciseEditor.tsx)
// and save shape.
//
// Each exercise is a list of individual sets (0020) — each set has its own
// target/rest, added one at a time — rather than one shared rounds count,
// matching the Everfit-style reference the owner asked to match.

export type SegmentType = "warmup" | "straight" | "circuit" | "finisher" | "cooldown";
export type MetricType = "weight_kg" | "weight_kg_and_reps" | "reps_only" | "time_seconds" | "distance_m";

export const SEGMENT_TYPE_LABEL: Record<SegmentType, string> = {
  warmup: "Warm-up",
  straight: "Straight sets",
  circuit: "Circuit",
  finisher: "Finisher",
  cooldown: "Cooldown",
};

// A header-bar accent per segment type, so a wide multi-column layout of
// segment "blocks" is scannable at a glance (matches the coach's mental
// model of a workout as a row of distinct blocks).
export const SEGMENT_TYPE_ACCENT: Record<SegmentType, string> = {
  warmup: "#f0a82e",
  straight: "#2e9bf0",
  circuit: "#e0542e",
  finisher: "#c22ee0",
  cooldown: "#2ee09c",
};

export const METRIC_TYPE_LABEL: Record<MetricType, string> = {
  weight_kg: "Weight (kg)",
  weight_kg_and_reps: "Weight + reps",
  reps_only: "Reps only",
  time_seconds: "Time (seconds)",
  distance_m: "Distance (m)",
};

export type ExerciseSetInput = {
  target: string | null;
  restSeconds: number | null;
};

export type ExerciseInput = {
  name: string;
  metricType: MetricType;
  eachSide: boolean;
  tempo: string | null;
  note: string | null;
  videoUrl: string | null;
  sets: ExerciseSetInput[];
};

export type SegmentInput = {
  type: SegmentType;
  label: string | null;
  defaultRounds: number | null;
  exercises: ExerciseInput[];
};

export type ExerciseSetDraft = {
  key: string;
  target: string;
  restSeconds: number | null;
};

export type ExerciseDraft = {
  key: string;
  name: string;
  metricType: MetricType;
  eachSide: boolean;
  tempo: string;
  note: string;
  videoUrl: string;
  sets: ExerciseSetDraft[];
};

export type SegmentDraft = {
  key: string;
  type: SegmentType;
  label: string;
  defaultRounds: number | null;
  exercises: ExerciseDraft[];
};

export function newExerciseSetDraft(): ExerciseSetDraft {
  return { key: crypto.randomUUID(), target: "", restSeconds: null };
}

export function newExerciseDraft(): ExerciseDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    metricType: "weight_kg",
    eachSide: false,
    tempo: "",
    note: "",
    videoUrl: "",
    sets: [newExerciseSetDraft()],
  };
}

export function newSegmentDraft(): SegmentDraft {
  return {
    key: crypto.randomUUID(),
    type: "straight",
    label: "",
    defaultRounds: null,
    exercises: [newExerciseDraft()],
  };
}

export function draftsToInput(segments: SegmentDraft[]): SegmentInput[] {
  return segments.map((s) => ({
    type: s.type,
    label: s.label.trim() || null,
    defaultRounds: s.defaultRounds,
    exercises: s.exercises.map((e) => ({
      name: e.name,
      metricType: e.metricType,
      eachSide: e.eachSide,
      tempo: e.tempo.trim() || null,
      note: e.note.trim() || null,
      videoUrl: e.videoUrl.trim() || null,
      sets: e.sets.map((set) => ({
        target: set.target.trim() || null,
        restSeconds: set.restSeconds,
      })),
    })),
  }));
}
