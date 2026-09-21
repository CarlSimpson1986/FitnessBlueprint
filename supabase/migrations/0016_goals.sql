-- ============================================================================
-- 0016_goals.sql
-- Member-created goals, set via the Coach Ted-branded wizard (a scripted
-- client-side flow, NOT the Gemini chat pipeline — see
-- fitness-blueprint-build-spec.md handoff, section 4 "Goal setting").
--
-- RLS ships in this same migration, per supabase/migrations/README.md.
-- ============================================================================

create type goal_type as enum ('lose_weight', 'build_strength', 'general_fitness', 'event_prep');
create type goal_status as enum ('active', 'completed', 'abandoned');

create table goals (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  type goal_type not null,
  metric text not null, -- e.g. "Weight (kg)", "Deadlift (kg)" — a curated chip
                         -- label in the UI, not DB-enforced, since the option
                         -- set is expected to evolve without a migration
  long_target text not null,
  long_date date,
  micro_target text not null,
  checkin_date date not null,
  barriers text,
  habits text[] not null default '{}', -- feeds directly into the real
                                        -- habit_definitions/habit_logs checklist,
                                        -- not a separate list
  why text,
  status goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table goals is
  'Member-created goal (not coach-set). One row per goal-setting/6-week-checkin pass — status tracks lifecycle, app queries the latest active row per member.';

create index idx_goals_member on goals (member_id, created_at desc);

create trigger trg_goals_updated_at
  before update on goals
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table goals enable row level security;

create policy "members manage own goals"
  on goals for all
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id);

create policy "coaches and owner read all goals"
  on goals for select
  using (is_coach_or_owner());
