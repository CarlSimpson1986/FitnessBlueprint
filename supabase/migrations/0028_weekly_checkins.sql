-- ============================================================================
-- 0028_weekly_checkins.sql
-- The Sunday weekly check-in with Ted: a member rates their week (energy,
-- sleep, nutrition 1-5), optionally logs their weight, and notes a win, what
-- got in the way, and anything for their coach. Prompted on the home page
-- Sunday-Wednesday and by the Sunday reminder email
-- (src/app/api/cron/reminders/route.ts). One row per member per week, keyed
-- by the Sunday the check-in is for.
-- ============================================================================

create table weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  week_of date not null, -- the Sunday this check-in is for
  weight_kg numeric(5, 2),
  energy smallint not null check (energy between 1 and 5),
  sleep smallint not null check (sleep between 1 and 5),
  nutrition smallint not null check (nutrition between 1 and 5),
  win text,
  struggle text,
  note_for_coach text,
  created_at timestamptz not null default now(),
  unique (member_id, week_of)
);

comment on table weekly_checkins is
  'Member''s Sunday weekly check-in with Ted (week ratings, optional weight, win/struggle/note for coach). One per member per week_of Sunday.';

create index idx_weekly_checkins_week on weekly_checkins (week_of desc);

alter table weekly_checkins enable row level security;

create policy "members read own weekly checkins"
  on weekly_checkins for select
  using (auth.uid() = member_id);

create policy "members submit own weekly checkins"
  on weekly_checkins for insert
  with check (auth.uid() = member_id);

create policy "members edit own weekly checkins"
  on weekly_checkins for update
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id);

-- Coaches view members' check-ins (read-only, per 0024's coach model);
-- only the member ever writes one.
create policy "coaches and owner read all weekly checkins"
  on weekly_checkins for select
  using (is_coach_or_owner());
