-- ============================================================================
-- 0042_coach_permissions.sql
-- Guy turns each area of the coach app on or off per coach: Today (their
-- sessions + attendance), Programme (the view-only calendar) and Check-ins
-- (members' check-ins and other health data). Replaces coach_access_level,
-- which was never enforced anywhere.
--
-- No row for a coach = everything on, which is how coaches worked before
-- this migration. The owner always sees everything.
--
-- Enforced here, not just in the menu:
--   checkins  -> coach reads of weekly_checkins, readiness_checkins,
--                body_metrics, habit_logs, goals
--   today     -> coach reads of bookings, and marking attendance
--   programme -> page gate only: workout content is readable by members
--                anyway, so there is nothing private to protect in RLS.
-- Safe to run before or after 0038 (calls is_coach_or_owner(), whichever
-- version is live).
-- ============================================================================

create table coach_permissions (
  coach_id uuid primary key references profiles (id) on delete cascade,
  can_view_today boolean not null default true,
  can_view_programme boolean not null default true,
  can_view_checkins boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table coach_permissions is
  'Per-coach on/off for areas of the coach app, set by the owner. No row = all on. Read via staff_can_view().';

alter table coach_permissions enable row level security;

create policy "owner manages coach permissions"
  on coach_permissions for all
  using (is_owner())
  with check (is_owner());

create policy "coaches read own permissions"
  on coach_permissions for select
  using (auth.uid() = coach_id);

-- Owner: always true. Coach: their switch for that area (true if no row).
-- Anyone else, or an unknown area name: false.
create or replace function staff_can_view(area text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_coach_or_owner() and (
    auth_role() = 'owner'
    or coalesce(
      (select case area
                when 'today' then can_view_today
                when 'programme' then can_view_programme
                when 'checkins' then can_view_checkins
              end
       from coach_permissions where coach_id = auth.uid()),
      area in ('today', 'programme', 'checkins')
    )
  );
$$;

comment on function staff_can_view(text) is
  'True if the caller is the owner, or a coach whose coach_permissions switch for area (today/programme/checkins) is on.';

-- ----------------------------------------------------------------------------
-- Check-ins and health data
-- ----------------------------------------------------------------------------
drop policy "coaches and owner read all weekly checkins" on weekly_checkins;
create policy "coaches and owner read all weekly checkins"
  on weekly_checkins for select
  using (staff_can_view('checkins'));

drop policy "coaches and owner read all checkins" on readiness_checkins;
create policy "coaches and owner read all checkins"
  on readiness_checkins for select
  using (staff_can_view('checkins'));

drop policy "coaches and owner read all body metrics" on body_metrics;
create policy "coaches and owner read all body metrics"
  on body_metrics for select
  using (staff_can_view('checkins'));

drop policy "coaches and owner read all habit logs" on habit_logs;
create policy "coaches and owner read all habit logs"
  on habit_logs for select
  using (staff_can_view('checkins'));

drop policy "coaches and owner read all goals" on goals;
create policy "coaches and owner read all goals"
  on goals for select
  using (staff_can_view('checkins'));

-- ----------------------------------------------------------------------------
-- Today: bookings and attendance
-- ----------------------------------------------------------------------------
drop policy "coaches and owner read all bookings" on bookings;
create policy "coaches and owner read all bookings"
  on bookings for select
  using (staff_can_view('today'));

drop policy "coaches mark attendance on their own sessions" on bookings;
create policy "coaches mark attendance on their own sessions"
  on bookings for update
  using (
    staff_can_view('today')
    and exists (select 1 from sessions s where s.id = bookings.session_id and s.coach_id = auth.uid())
  )
  with check (status in ('attended', 'no_show', 'excused'));

-- ----------------------------------------------------------------------------
-- coach_access_level is replaced by coach_permissions.
-- ----------------------------------------------------------------------------
alter table profiles drop column coach_access_level;
drop type coach_access_level;

comment on table profiles is
  'One row per person. What each coach can see is set per coach in coach_permissions.';
