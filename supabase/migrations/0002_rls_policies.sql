-- ============================================================================
-- 0002_rls_policies.sql
-- Fitness Blueprint — Row Level Security
--
-- Default posture: RLS ENABLED + NO POLICIES = fully locked (deny by
-- default). Every table below gets RLS turned on, then explicit policies
-- opened up one at a time. If a table is missing from this file, assume
-- it's fully locked — that's a bug to fix, not a gap the app works around
-- with the admin client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions — read the caller's own role without recursive RLS
-- checks (security definer + stable, so Postgres can cache it per statement)
-- ----------------------------------------------------------------------------
create or replace function auth_role()
returns member_role
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_coach_or_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(auth_role() in ('coach', 'owner'), false);
$$;

create or replace function is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(auth_role() = 'owner', false);
$$;

-- ============================================================================
-- profiles
-- ============================================================================
alter table profiles enable row level security;

create policy "members read own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "coaches and owner read all profiles"
  on profiles for select
  using (is_coach_or_owner());

create policy "members update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'member'); -- can't self-promote to coach/owner

create policy "owner manages all profiles"
  on profiles for all
  using (is_owner())
  with check (is_owner());

-- ============================================================================
-- membership_plans — public reference data, readable by any signed-in user,
-- writable only by the owner
-- ============================================================================
alter table membership_plans enable row level security;

create policy "authenticated users read plans"
  on membership_plans for select
  to authenticated
  using (true);

create policy "owner manages plans"
  on membership_plans for insert
  with check (is_owner());

create policy "owner updates plans"
  on membership_plans for update
  using (is_owner());

-- ============================================================================
-- member_memberships
-- ============================================================================
alter table member_memberships enable row level security;

create policy "members read own membership"
  on member_memberships for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all memberships"
  on member_memberships for select
  using (is_coach_or_owner());

create policy "owner manages memberships"
  on member_memberships for all
  using (is_owner())
  with check (is_owner());

-- ============================================================================
-- credit_ledger — members can read their own history but NEVER write
-- directly. All writes go through server-side logic (booking flow, admin
-- adjustments, the monthly reset job) using the admin client, so the
-- ledger can't be gamed by a client-side insert.
-- ============================================================================
alter table credit_ledger enable row level security;

create policy "members read own credit history"
  on credit_ledger for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all credit history"
  on credit_ledger for select
  using (is_coach_or_owner());

-- Deliberately no insert/update/delete policy for authenticated/anon.
-- Writes happen exclusively via the service role in server-side routes.

-- ============================================================================
-- session_templates — reference data
-- ============================================================================
alter table session_templates enable row level security;

create policy "authenticated users read templates"
  on session_templates for select
  to authenticated
  using (true);

create policy "coaches and owner manage templates"
  on session_templates for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

-- ============================================================================
-- sessions — everyone can see the timetable; only coaches/owner edit it
-- ============================================================================
alter table sessions enable row level security;

create policy "authenticated users read sessions"
  on sessions for select
  to authenticated
  using (true);

create policy "coaches and owner manage sessions"
  on sessions for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

-- ============================================================================
-- session_plans — published plans are visible to everyone (session preview);
-- unpublished drafts are coach/owner only
-- ============================================================================
alter table session_plans enable row level security;

create policy "members read published plans"
  on session_plans for select
  using (is_published = true or is_coach_or_owner());

create policy "coaches and owner manage plans"
  on session_plans for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

-- ============================================================================
-- bookings
-- ============================================================================
alter table bookings enable row level security;

create policy "members read own bookings"
  on bookings for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all bookings"
  on bookings for select
  using (is_coach_or_owner());

create policy "members create own bookings"
  on bookings for insert
  with check (auth.uid() = member_id);

create policy "members cancel own bookings"
  on bookings for update
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id and status = 'cancelled');

create policy "coaches and owner update any booking"
  on bookings for update
  using (is_coach_or_owner());

-- ============================================================================
-- waitlist_entries
-- ============================================================================
alter table waitlist_entries enable row level security;

create policy "members read own waitlist entries"
  on waitlist_entries for select
  using (auth.uid() = member_id or auth.uid() = buddy_member_id);

create policy "coaches and owner read all waitlist entries"
  on waitlist_entries for select
  using (is_coach_or_owner());

create policy "members join waitlist"
  on waitlist_entries for insert
  with check (auth.uid() = member_id);

create policy "members update own waitlist entry"
  on waitlist_entries for update
  using (auth.uid() = member_id);

-- ============================================================================
-- readiness_checkins — health-adjacent data. Members see only their own;
-- coaches/owner see all (they need it before the session starts).
-- ============================================================================
alter table readiness_checkins enable row level security;

create policy "members read own checkins"
  on readiness_checkins for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all checkins"
  on readiness_checkins for select
  using (is_coach_or_owner());

create policy "members submit own checkin"
  on readiness_checkins for insert
  with check (auth.uid() = member_id);

-- ============================================================================
-- session_notes — coach-authored, contains injury/health context.
-- Members can read notes about themselves (transparency); only coaches
-- and owner can write.
-- ============================================================================
alter table session_notes enable row level security;

create policy "members read own notes"
  on session_notes for select
  using (auth.uid() = member_id);

create policy "coaches and owner read all notes"
  on session_notes for select
  using (is_coach_or_owner());

create policy "coaches and owner write notes"
  on session_notes for insert
  with check (is_coach_or_owner());

-- ============================================================================
-- session_feedback — PRIVATE TO OWNER ONLY per confirmed decision.
-- Coaches explicitly do NOT get a read policy here — this is deliberate,
-- not an oversight. Members can insert their own feedback but never read
-- anyone's, including their own, back through the API (the app can show
-- a local "thanks" confirmation without a read round-trip).
-- ============================================================================
alter table session_feedback enable row level security;

create policy "owner reads all feedback"
  on session_feedback for select
  using (is_owner());

create policy "members submit own feedback"
  on session_feedback for insert
  with check (auth.uid() = member_id);

-- ============================================================================
-- challenges & challenge_participants
-- ============================================================================
alter table challenges enable row level security;

create policy "authenticated users read challenges"
  on challenges for select
  to authenticated
  using (true);

create policy "coaches and owner manage challenges"
  on challenges for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

alter table challenge_participants enable row level security;

create policy "authenticated users read participants"
  on challenge_participants for select
  to authenticated
  using (true); -- progress is meant to be visible to fellow participants

create policy "members join open challenges"
  on challenge_participants for insert
  with check (
    auth.uid() = member_id
    and exists (
      select 1 from challenges
      where id = challenge_id and is_open = true
    )
  );

create policy "coaches and owner add any participant"
  on challenge_participants for insert
  with check (is_coach_or_owner());

-- ============================================================================
-- events & event_interests
-- ============================================================================
alter table events enable row level security;

create policy "authenticated users read events"
  on events for select
  to authenticated
  using (true);

create policy "members post their own events"
  on events for insert
  with check (auth.uid() = created_by and event_type = 'member_posted');

create policy "coaches and owner post gym events"
  on events for insert
  with check (is_coach_or_owner() and event_type = 'gym');

create policy "creator or owner edits event"
  on events for update
  using (auth.uid() = created_by or is_owner());

alter table event_interests enable row level security;

create policy "authenticated users read interests"
  on event_interests for select
  to authenticated
  using (true);

create policy "members express own interest"
  on event_interests for insert
  with check (auth.uid() = member_id);
