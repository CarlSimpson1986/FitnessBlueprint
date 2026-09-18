-- ============================================================================
-- 0009_habit_and_progress_tracking.sql
-- Daily habit checklist + bodyweight logging for the member Progress tab.
-- RLS ships in this same migration, per supabase/migrations/README.md.
-- ============================================================================

create table habit_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table habit_definitions is
  'Fixed v1 set of daily habits members check off. No admin UI to add/edit these yet — seeded directly by this migration.';

insert into habit_definitions (name, sort_order) values
  ('Drink 2L water', 1),
  ('8,000 steps', 2),
  ('Hit protein target', 3),
  ('7+ hours sleep', 4);

create table habit_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  habit_id uuid not null references habit_definitions (id) on delete cascade,
  log_date date not null,
  completed_at timestamptz not null default now(),
  unique (member_id, habit_id, log_date)
);

comment on table habit_logs is
  'One row per habit checked off per member per day. A toggle log, not append-only — unchecking deletes the row for that day.';

create index idx_habit_logs_member_date on habit_logs (member_id, log_date);

create table weigh_ins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  weight_kg numeric(5,2) not null,
  recorded_at timestamptz not null default now()
);

comment on table weigh_ins is
  'Member-logged bodyweight for the Progress-tab delta stat. Append-only like credit_ledger — a correction is a new row, never an edit.';

create index idx_weigh_ins_member on weigh_ins (member_id, recorded_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table habit_definitions enable row level security;
alter table habit_logs enable row level security;
alter table weigh_ins enable row level security;

-- habit_definitions — reference data, same pattern as session_templates.
create policy "authenticated users read habit definitions"
  on habit_definitions for select
  to authenticated
  using (true);

create policy "owner manages habit definitions"
  on habit_definitions for all
  using (is_owner())
  with check (is_owner());

-- habit_logs — member-owned toggle log, same pattern as bookings/readiness_checkins.
create policy "members read own habit logs"
  on habit_logs for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all habit logs"
  on habit_logs for select
  using (is_coach_or_owner());

create policy "members log own habits today"
  on habit_logs for insert
  with check (auth.uid() = member_id and log_date = current_date);

create policy "members unlog own habits today"
  on habit_logs for delete
  using (auth.uid() = member_id and log_date = current_date);

-- weigh_ins — member-owned append-only log, same pattern as credit_ledger.
create policy "members read own weigh-ins"
  on weigh_ins for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all weigh-ins"
  on weigh_ins for select
  using (is_coach_or_owner());

create policy "members log own weigh-ins"
  on weigh_ins for insert
  with check (auth.uid() = member_id);
