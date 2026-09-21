-- ============================================================================
-- 0015_workout_content_and_logging.sql
-- Structured Session -> Segment -> Exercise content, and member-logged sets.
--
-- This is a DIFFERENT, separate concern from session_plans (0001) — that's a
-- free-text blurb matched to a session for the "What's On Today" bulk
-- upload. This is the structured shape the live-logging screen renders
-- directly, per the session-template-spec.md design handoff: nothing about
-- circuit-vs-sequential layout is hardcoded per class type, it's a direct
-- render of these rows.
--
-- RLS ships in this same migration, per supabase/migrations/README.md.
-- ============================================================================

create type segment_type as enum ('warmup', 'straight', 'circuit', 'finisher', 'cooldown');

create table session_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  type segment_type not null,
  label text, -- e.g. "Circuit A" — shown to member only if set
  default_rounds integer, -- applies to every exercise in this segment unless the exercise overrides it
  sort_order integer not null
);

comment on table session_segments is
  'An ordered block within a scheduled session''s workout (warmup/circuit/etc). Coach-built from scratch per session — no reusable template layer in v1.';

create index idx_session_segments_session on session_segments (session_id, sort_order);

create type exercise_metric_type as enum ('weight_kg', 'weight_kg_and_reps', 'reps_only', 'time_seconds', 'distance_m');

create table session_exercises (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references session_segments (id) on delete cascade,
  name text not null,
  rounds integer, -- overrides segment.default_rounds if set — this is what makes
                   -- Deadlift=3 / Kettlebell=4 / Sled push=2 coexist in one circuit
  metric_type exercise_metric_type not null,
  target text, -- coach's prescribed target shown to member, e.g. "12 reps" — separate from what's logged
  rest_seconds integer, -- coach's own programming reference, not necessarily shown to the member
  video_url text,
  sort_order integer not null
);

comment on table session_exercises is
  'A single movement within a session_segment. Field count on the live-logging screen = effective rounds (own rounds, else segment.default_rounds); field shape depends on metric_type.';

create index idx_session_exercises_segment on session_exercises (segment_id, sort_order);

create table exercise_logs (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references session_exercises (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  weight_kg numeric(6, 2),
  reps integer,
  time_seconds integer,
  distance_m numeric(7, 2),
  logged_at timestamptz not null default now(),
  constraint exercise_logs_has_a_value check (
    weight_kg is not null or reps is not null or time_seconds is not null or distance_m is not null
  ),
  unique (exercise_id, member_id, round_number)
);

comment on table exercise_logs is
  'One row per round a member logs for an exercise. Only the column(s) matching the exercise''s metric_type get populated — app-enforced, not DB-enforced. Total-lifted/personal-records stats are computed at read time from this table (see src/lib/progress.ts convention), not stored counters.';

create index idx_exercise_logs_member on exercise_logs (member_id, logged_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table session_segments enable row level security;
alter table session_exercises enable row level security;
alter table exercise_logs enable row level security;

-- session_segments / session_exercises — same read-all / coach-owner-manage
-- pattern as sessions itself (0002).
create policy "authenticated users read session segments"
  on session_segments for select
  to authenticated
  using (true);

create policy "coaches and owner manage session segments"
  on session_segments for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

create policy "authenticated users read session exercises"
  on session_exercises for select
  to authenticated
  using (true);

create policy "coaches and owner manage session exercises"
  on session_exercises for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

-- exercise_logs — member-owned, self-serve live data entry. Insert+update
-- (not delete) so a member can fix a typo before finishing a workout, same
-- reasoning as the readiness_checkins pattern, not the strictly append-only
-- credit_ledger/weigh_ins pattern (this isn't a historical ledger).
create policy "members read own exercise logs"
  on exercise_logs for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all exercise logs"
  on exercise_logs for select
  using (is_coach_or_owner());

create policy "members log own exercises"
  on exercise_logs for insert
  with check (auth.uid() = member_id);

create policy "members correct own exercise logs"
  on exercise_logs for update
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id);
