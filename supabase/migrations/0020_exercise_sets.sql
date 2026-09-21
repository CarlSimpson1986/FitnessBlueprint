-- ============================================================================
-- 0020_exercise_sets.sql
-- Replaces the shared rounds/target/rest_seconds-per-exercise shape (0015)
-- with explicit per-set rows, matching the Everfit-style reference the
-- owner asked to match: each set gets its own target/rest, added one at a
-- time, instead of one rounds count applying identically to every round.
-- Also adds each_side/tempo/note, visible in the same reference UI.
--
-- Never edit 0015/0019 (already applied) — this alters their tables
-- forward instead, per supabase/migrations/README.md.
-- ============================================================================

create table session_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references session_exercises (id) on delete cascade,
  set_number integer not null,
  target text,
  rest_seconds integer,
  sort_order integer not null
);

create index idx_session_exercise_sets_exercise on session_exercise_sets (exercise_id, sort_order);

create table template_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references template_exercises (id) on delete cascade,
  set_number integer not null,
  target text,
  rest_seconds integer,
  sort_order integer not null
);

create index idx_template_exercise_sets_exercise on template_exercise_sets (exercise_id, sort_order);

alter table session_exercises drop column rounds;
alter table session_exercises drop column target;
alter table session_exercises drop column rest_seconds;
alter table session_exercises add column each_side boolean not null default false;
alter table session_exercises add column tempo text;
alter table session_exercises add column note text;

alter table template_exercises drop column rounds;
alter table template_exercises drop column target;
alter table template_exercises drop column rest_seconds;
alter table template_exercises add column each_side boolean not null default false;
alter table template_exercises add column tempo text;
alter table template_exercises add column note text;

-- exercise_logs (0015) previously kept a bare round_number; a log entry now
-- points at the specific prescribed set it's logging against, since sets
-- carry their own target/rest context. No real rows exist yet (Phase 3
-- member live-logging was never built), so this is a plain shape change,
-- not a backfill.
alter table exercise_logs drop constraint exercise_logs_exercise_id_member_id_round_number_key;
alter table exercise_logs drop column round_number;
alter table exercise_logs add column set_id uuid references session_exercise_sets (id) on delete cascade;
alter table exercise_logs alter column set_id set not null;
alter table exercise_logs add constraint exercise_logs_set_id_member_id_key unique (set_id, member_id);

-- ----------------------------------------------------------------------------
-- RLS — same authenticated-read / coach-owner-manage pattern as their parent
-- segment/exercise tables (0015/0019).
-- ----------------------------------------------------------------------------
alter table session_exercise_sets enable row level security;
alter table template_exercise_sets enable row level security;

create policy "authenticated users read session exercise sets"
  on session_exercise_sets for select
  to authenticated
  using (true);

create policy "coaches and owner manage session exercise sets"
  on session_exercise_sets for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

create policy "authenticated users read template exercise sets"
  on template_exercise_sets for select
  to authenticated
  using (true);

create policy "coaches and owner manage template exercise sets"
  on template_exercise_sets for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());
