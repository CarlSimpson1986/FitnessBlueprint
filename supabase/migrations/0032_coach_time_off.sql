-- ============================================================================
-- 0032_coach_time_off.sql
-- Coach holidays / time off. The owner records a date range per coach;
-- the owner dashboard shows who's off in the next two weeks and the
-- program calendar flags any session whose coach is off that day, so
-- cover gets sorted before the day. Owner-only writes, per the "only the
-- owner creates or edits" rule (CLAUDE.md, 0024); a coach can read their
-- own rows.
-- ============================================================================

create table coach_time_off (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null, -- inclusive
  note text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

comment on table coach_time_off is
  'Coach holidays/time off (inclusive date range). Owner-managed; drives the dashboard "coaches off" tile and program-calendar cover warnings.';

create index idx_coach_time_off_dates on coach_time_off (ends_on, starts_on);

alter table coach_time_off enable row level security;

create policy "owner manages coach time off"
  on coach_time_off for all
  using (is_owner())
  with check (is_owner());

create policy "coaches read own time off"
  on coach_time_off for select
  using (auth.uid() = coach_id);
