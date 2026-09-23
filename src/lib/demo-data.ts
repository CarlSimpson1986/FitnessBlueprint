import "server-only";
import { randomUUID } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ensureInternalAccount, ensureTestAccount } from "@/lib/test-accounts-server";
import type { Database } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
type MetricType = Database["public"]["Enums"]["exercise_metric_type"];
type SegmentType = Database["public"]["Enums"]["segment_type"];

/**
 * Owner-only demo data: 5 fake clients plus four weeks (two past, two
 * ahead) of classes coached by the "Test Coach" view-as account, each
 * with a full workout, bookings, attendance, logged lifts, feedback,
 * weigh-ins and goals — so the app can be seen populated.
 *
 * Identified for removal by the demo clients' reserved-TLD emails and by
 * sessions being coached by Test Coach. Uses the admin client because it
 * writes rows *as other people* (their bookings, logs, feedback), which
 * RLS rightly never lets the owner do through the normal client.
 */

const DEMO_EMAIL_DOMAIN = "fitnessblueprints.invalid";
const DEMO_CLIENTS = [
  { n: 1, name: "Sarah Mitchell", startKg: 72, goalKg: 66 },
  { n: 2, name: "James Carter", startKg: 91, goalKg: 85 },
  { n: 3, name: "Priya Shah", startKg: 63, goalKg: 60 },
  { n: 4, name: "Tom Wilson", startKg: 84, goalKg: 80 },
  { n: 5, name: "Emma Brooks", startKg: 68, goalKg: 64 },
];
const demoEmail = (n: number) => `demo-${n}@${DEMO_EMAIL_DOMAIN}`;
export const DEMO_EMAIL_PATTERN = `demo-%@${DEMO_EMAIL_DOMAIN}`;

type ExerciseDef = {
  name: string;
  metric: MetricType;
  sets: number;
  target: string;
  rest?: number;
  eachSide?: boolean;
  baseKg?: number; // starting working weight for logs
};
type SegmentDef = { type: SegmentType; label: string | null; rounds: number | null; exercises: ExerciseDef[] };

const WORKOUTS: Record<"circuits" | "strength" | "hyrox", SegmentDef[]> = {
  circuits: [
    {
      type: "warmup",
      label: "Warm-up",
      rounds: null,
      exercises: [
        { name: "Row", metric: "time_seconds", sets: 1, target: "3 min easy" },
        { name: "World's greatest stretch", metric: "reps_only", sets: 1, target: "5 each side", eachSide: true },
        { name: "Air squat", metric: "reps_only", sets: 1, target: "15" },
      ],
    },
    {
      type: "circuit",
      label: "Circuit A",
      rounds: 3,
      exercises: [
        { name: "Kettlebell swing", metric: "weight_kg_and_reps", sets: 3, target: "15 reps", rest: 30, baseKg: 16 },
        { name: "Goblet squat", metric: "weight_kg_and_reps", sets: 3, target: "12 reps", rest: 30, baseKg: 16 },
        { name: "Push-up", metric: "reps_only", sets: 3, target: "10-15", rest: 30 },
        { name: "Ski erg", metric: "distance_m", sets: 3, target: "250m", rest: 60 },
      ],
    },
    {
      type: "finisher",
      label: "Finisher",
      rounds: null,
      exercises: [{ name: "Burpees", metric: "reps_only", sets: 1, target: "Max in 2 min" }],
    },
  ],
  strength: [
    {
      type: "warmup",
      label: "Warm-up",
      rounds: null,
      exercises: [
        { name: "Band pull-apart", metric: "reps_only", sets: 2, target: "15" },
        { name: "Glute bridge", metric: "reps_only", sets: 2, target: "12" },
      ],
    },
    {
      type: "straight",
      label: "Main lifts",
      rounds: null,
      exercises: [
        { name: "Back squat", metric: "weight_kg_and_reps", sets: 4, target: "5 reps @ RPE 7", rest: 120, baseKg: 60 },
        { name: "Romanian deadlift", metric: "weight_kg_and_reps", sets: 3, target: "8 reps", rest: 90, baseKg: 50 },
        { name: "Bench press", metric: "weight_kg_and_reps", sets: 4, target: "6 reps", rest: 120, baseKg: 45 },
      ],
    },
    {
      type: "cooldown",
      label: "Cool-down",
      rounds: null,
      exercises: [{ name: "Couch stretch", metric: "time_seconds", sets: 1, target: "60s each side", eachSide: true }],
    },
  ],
  hyrox: [
    {
      type: "warmup",
      label: "Warm-up",
      rounds: null,
      exercises: [{ name: "Easy jog", metric: "time_seconds", sets: 1, target: "5 min" }],
    },
    {
      type: "circuit",
      label: "Hyrox sim",
      rounds: 4,
      exercises: [
        { name: "Run", metric: "distance_m", sets: 4, target: "1000m" },
        { name: "Wall balls", metric: "reps_only", sets: 4, target: "20" },
        { name: "Sled push", metric: "distance_m", sets: 4, target: "25m" },
        { name: "Farmers carry", metric: "weight_kg", sets: 4, target: "50m", baseKg: 20 },
      ],
    },
    {
      type: "cooldown",
      label: "Cool-down",
      rounds: null,
      exercises: [{ name: "Walk + stretch", metric: "time_seconds", sets: 1, target: "5 min" }],
    },
  ],
};

// Mon=1 … Sat=6. Which class runs when in the demo timetable.
const TIMETABLE: { weekday: number; time: string; kind: keyof typeof WORKOUTS }[] = [
  { weekday: 1, time: "06:00", kind: "circuits" },
  { weekday: 2, time: "18:30", kind: "strength" },
  { weekday: 3, time: "06:00", kind: "circuits" },
  { weekday: 4, time: "18:30", kind: "strength" },
  { weekday: 5, time: "06:00", kind: "circuits" },
  { weekday: 6, time: "09:00", kind: "hyrox" },
];

const FEEDBACK_COMMENTS = [
  "Loved the circuit, great energy.",
  "Tough one today!",
  "Music could be louder 😄",
  null,
  "Felt strong — squats are coming on.",
  null,
];

/** Deterministic PRNG so reloading demo data gives the same picture. */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function londonTodayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstNumber(text: string, fallback: number) {
  const match = text.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

async function hasDemoData(admin: AdminClient) {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .like("email", DEMO_EMAIL_PATTERN);
  return (count ?? 0) > 0;
}

export async function seedDemoData(admin: AdminClient): Promise<{ error?: string }> {
  if (await hasDemoData(admin)) {
    return { error: "Demo data is already loaded — remove it first." };
  }

  const coach = await ensureTestAccount(admin, "coach");
  if (coach.error || !coach.id) return { error: coach.error ?? "Could not set up Test Coach." };
  const coachId = coach.id;

  // --- Clients -------------------------------------------------------------
  const clients: { id: string; startKg: number; goalKg: number; name: string; n: number }[] = [];
  for (const c of DEMO_CLIENTS) {
    const result = await ensureInternalAccount(admin, {
      email: demoEmail(c.n),
      fullName: c.name,
      role: "member",
      appMetadata: { demo: true },
    });
    if (result.error || !result.id) return { error: result.error ?? `Could not create ${c.name}.` };
    clients.push({ id: result.id, ...c });
  }

  const { data: plans } = await admin
    .from("membership_plans")
    .select("id")
    .eq("is_active", true)
    .order("price_pence", { ascending: false });
  if (plans && plans.length > 0) {
    const { error } = await admin.from("member_memberships").insert(
      clients.map((c, i) => ({
        member_id: c.id,
        plan_id: plans[i % plans.length]!.id,
        status: "active" as const,
        started_at: new Date(Date.now() - (30 + i * 12) * 86400000).toISOString(),
      }))
    );
    if (error) return { error: `Memberships: ${error.message}` };
  }

  // --- Sessions + workouts ------------------------------------------------
  const { data: classes } = await admin
    .from("session_templates")
    .select("id, code, default_duration_minutes, default_capacity")
    .eq("is_active", true);
  const classByKind = (kind: string) =>
    classes?.find((c) => c.code === kind) ?? classes?.find((c) => c.code === "circuits") ?? classes?.[0];
  if (!classes || classes.length === 0) return { error: "Add at least one class before loading demo data." };

  const today = londonTodayKey();
  const todayWeekday = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const firstMonday = addDaysKey(today, -(todayWeekday - 1) - 14);

  type PlannedSession = { id: string; date: string; time: string; kind: keyof typeof WORKOUTS };
  const planned: PlannedSession[] = [];
  const sessionRows: Database["public"]["Tables"]["sessions"]["Insert"][] = [];

  for (let week = 0; week < 4; week++) {
    for (const slot of TIMETABLE) {
      const date = addDaysKey(firstMonday, week * 7 + slot.weekday - 1);
      const cls = classByKind(slot.kind)!;
      const id = randomUUID();
      planned.push({ id, date, time: slot.time, kind: slot.kind });
      sessionRows.push({
        id,
        template_id: cls.id,
        coach_id: coachId,
        session_date: date,
        start_time: slot.time,
        duration_minutes: cls.default_duration_minutes,
        capacity: cls.default_capacity,
        status: "scheduled",
      });
    }
  }

  const { error: sessionsError } = await admin.from("sessions").insert(sessionRows);
  if (sessionsError) return { error: `Sessions: ${sessionsError.message}` };

  // Build every session's workout, remembering set ids for logging below.
  type BuiltSet = { setId: string; exerciseId: string; def: ExerciseDef };
  const setsBySession = new Map<string, BuiltSet[]>();
  const segmentRows: Database["public"]["Tables"]["session_segments"]["Insert"][] = [];
  const exerciseRows: Database["public"]["Tables"]["session_exercises"]["Insert"][] = [];
  const setRows: Database["public"]["Tables"]["session_exercise_sets"]["Insert"][] = [];

  for (const session of planned) {
    const built: BuiltSet[] = [];
    WORKOUTS[session.kind].forEach((segment, si) => {
      const segmentId = randomUUID();
      segmentRows.push({
        id: segmentId,
        session_id: session.id,
        type: segment.type,
        label: segment.label,
        default_rounds: segment.rounds,
        sort_order: si,
      });
      segment.exercises.forEach((exercise, ei) => {
        const exerciseId = randomUUID();
        exerciseRows.push({
          id: exerciseId,
          segment_id: segmentId,
          name: exercise.name,
          metric_type: exercise.metric,
          each_side: exercise.eachSide ?? false,
          sort_order: ei,
        });
        for (let k = 0; k < exercise.sets; k++) {
          const setId = randomUUID();
          setRows.push({
            id: setId,
            exercise_id: exerciseId,
            set_number: k + 1,
            target: exercise.target,
            rest_seconds: exercise.rest ?? null,
            sort_order: k,
          });
          built.push({ setId, exerciseId, def: exercise });
        }
      });
    });
    setsBySession.set(session.id, built);
  }

  for (const [table, rows] of [
    ["session_segments", segmentRows],
    ["session_exercises", exerciseRows],
    ["session_exercise_sets", setRows],
  ] as const) {
    const { error } = await admin.from(table).insert(rows as never);
    if (error) return { error: `${table}: ${error.message}` };
  }

  // --- Bookings, attendance, logs, feedback, readiness -------------------
  const random = rng(42);
  const bookingRows: Database["public"]["Tables"]["bookings"]["Insert"][] = [];
  const logRows: Database["public"]["Tables"]["exercise_logs"]["Insert"][] = [];
  const feedbackRows: Database["public"]["Tables"]["session_feedback"]["Insert"][] = [];
  const readinessRows: Database["public"]["Tables"]["readiness_checkins"]["Insert"][] = [];

  for (const session of planned) {
    const isPast = session.date < today;
    const isToday = session.date === today;
    const attendees = clients.filter(() => random() < (isPast ? 0.75 : 0.55));
    const weekIndex = Math.floor(planned.indexOf(session) / TIMETABLE.length);

    for (const client of attendees) {
      const noShow = isPast && random() < 0.1;
      const bookedAt = new Date(`${addDaysKey(session.date, -2)}T12:00:00Z`).toISOString();
      bookingRows.push({
        session_id: session.id,
        member_id: client.id,
        status: isPast ? (noShow ? "no_show" : "attended") : "booked",
        booked_at: bookedAt,
      });

      if (isToday) {
        readinessRows.push({
          member_id: client.id,
          session_id: session.id,
          feeling: (["great", "okay", "great", "rough", "okay"] as const)[client.n - 1]!,
          sleep_quality: (["good", "average", "good", "poor", "good"] as const)[client.n - 1]!,
          pain_area: client.n === 4 ? "Lower back" : null,
        });
      }

      if (!isPast || noShow) continue;

      const loggedAt = new Date(`${session.date}T${session.time}:00Z`).toISOString();
      const strength = 0.8 + client.n * 0.08; // clients lift different weights
      for (const set of setsBySession.get(session.id) ?? []) {
        const { def } = set;
        const kg =
          def.baseKg !== undefined
            ? Math.round((def.baseKg * strength + weekIndex * 2.5) / 2.5) * 2.5
            : null;
        const reps = firstNumber(def.target, 12);
        logRows.push({
          exercise_id: set.exerciseId,
          set_id: set.setId,
          member_id: client.id,
          logged_at: loggedAt,
          weight_kg: def.metric === "weight_kg" || def.metric === "weight_kg_and_reps" ? kg : null,
          reps: def.metric === "reps_only" || def.metric === "weight_kg_and_reps" ? reps : null,
          time_seconds: def.metric === "time_seconds" ? firstNumber(def.target, 3) * 60 : null,
          distance_m: def.metric === "distance_m" ? firstNumber(def.target, 250) : null,
        });
      }

      if (random() < 0.5) {
        feedbackRows.push({
          session_id: session.id,
          member_id: client.id,
          class_rating: 4 + Math.round(random()),
          effort_rating: 3 + Math.round(random() * 2),
          experience_rating: 4 + Math.round(random()),
          comment: FEEDBACK_COMMENTS[Math.floor(random() * FEEDBACK_COMMENTS.length)] ?? null,
          created_at: loggedAt,
        });
      }
    }
  }

  for (const [table, rows] of [
    ["bookings", bookingRows],
    ["exercise_logs", logRows],
    ["session_feedback", feedbackRows],
    ["readiness_checkins", readinessRows],
  ] as const) {
    if (rows.length === 0) continue;
    const { error } = await admin.from(table).insert(rows as never);
    if (error) return { error: `${table}: ${error.message}` };
  }

  // --- Weigh-ins + goals --------------------------------------------------
  const metricRows: Database["public"]["Tables"]["body_metrics"]["Insert"][] = [];
  for (const client of clients) {
    for (let w = 6; w >= 0; w--) {
      const progress = (6 - w) / 6;
      const weight = client.startKg - (client.startKg - client.goalKg) * 0.4 * progress + (random() - 0.5) * 0.6;
      metricRows.push({
        member_id: client.id,
        weight_kg: Math.round(weight * 10) / 10,
        waist_cm: w % 3 === 0 ? Math.round((client.startKg * 1.05 - progress * 2) * 10) / 10 : null,
        recorded_at: new Date(`${addDaysKey(today, -w * 7)}T07:30:00Z`).toISOString(),
      });
    }
  }
  const { error: metricsError } = await admin.from("body_metrics").insert(metricRows);
  if (metricsError) return { error: `body_metrics: ${metricsError.message}` };

  const goalTypes = ["lose_weight", "build_strength", "general_fitness", "lose_weight", "event_prep"] as const;
  const { error: goalsError } = await admin.from("goals").insert(
    clients.map((c, i) => ({
      member_id: c.id,
      type: goalTypes[i]!,
      metric: goalTypes[i] === "build_strength" ? "Back squat (kg)" : "Weight (kg)",
      long_target: goalTypes[i] === "build_strength" ? "100kg back squat" : `${c.goalKg}kg`,
      long_date: addDaysKey(today, 90),
      micro_target: "3 sessions a week",
      checkin_date: addDaysKey(today, 21),
      habits: ["Hit 8k steps", "Protein with every meal"],
      why: "Feel fitter and more confident",
    }))
  );
  if (goalsError) return { error: `goals: ${goalsError.message}` };

  return {};
}

/**
 * Removes everything seedDemoData created: every session coached by Test
 * Coach (cascades to workouts, bookings, logs, feedback, readiness) and
 * the demo clients' accounts (cascades to their profile and all their
 * rows). Test Coach / Test Member accounts themselves are kept.
 */
export async function removeDemoData(admin: AdminClient): Promise<{ error?: string }> {
  const { data: demoProfiles } = await admin
    .from("profiles")
    .select("id")
    .like("email", DEMO_EMAIL_PATTERN);
  const coach = await ensureTestAccount(admin, "coach");

  if (coach.id) {
    const { data: sessions } = await admin.from("sessions").select("id").eq("coach_id", coach.id);
    const sessionIds = (sessions ?? []).map((s) => s.id);
    if (sessionIds.length > 0) {
      // credit_ledger references bookings without cascade, so a real
      // booking by the Test Member on a demo class would block the delete.
      const { data: bookings } = await admin.from("bookings").select("id").in("session_id", sessionIds);
      const bookingIds = (bookings ?? []).map((b) => b.id);
      if (bookingIds.length > 0) {
        const { count } = await admin
          .from("credit_ledger")
          .select("id", { count: "exact", head: true })
          .in("related_booking_id", bookingIds);
        if ((count ?? 0) > 0) {
          return {
            error:
              "Someone booked a demo class with real credits — cancel those bookings (so the credit is refunded) before removing demo data.",
          };
        }
      }

      const { error } = await admin.from("sessions").delete().in("id", sessionIds);
      if (error) return { error: `Sessions: ${error.message}` };
    }
  }

  for (const profile of demoProfiles ?? []) {
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error) return { error: error.message };
  }

  return {};
}
