-- ============================================================================
-- 0043_health_consent.sql
-- Health info is special category data (UK GDPR), so we only store it with
-- the member's explicit consent, and booking can never depend on saying
-- yes. Each person answers once (the app asks after sign-in, and again
-- before a booking if they skipped it) and can change it in Account
-- settings.
--
--   health_consent      null = not answered yet, false = no, true = yes
--   track_body_metrics  a yes can still opt out of weight / waist / body
--                       fat on their own (some people don't want them)
--
-- Enforced here:
--   - members can only save check-ins, readiness, habits, goals with a yes;
--     body metrics (and a weekly check-in weight) also need tracking on
--   - coaches and the owner stop seeing someone's health data the moment
--     they say no (and their measurements once tracking is off). Nothing
--     is deleted — the member can still see their own, and it reappears
--     if they opt back in. Deletion is a separate request (privacy page).
-- Run AFTER 0042 (uses staff_can_view()).
-- ============================================================================

alter table profiles
  add column health_consent boolean,
  add column health_consent_at timestamptz,
  add column track_body_metrics boolean not null default true;

comment on column profiles.health_consent is
  'Explicit consent to store health info: null = not asked yet, false = no, true = yes. Set via set_health_choices().';

create or replace function has_health_consent(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select health_consent from profiles where id = p_member_id), false);
$$;

create or replace function tracks_body_metrics(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select health_consent and track_body_metrics from profiles where id = p_member_id),
    false
  );
$$;

-- An RPC rather than a profiles update: coaches and the owner answer too,
-- and the profiles self-update policy only covers role = 'member'.
create or replace function set_health_choices(p_consent boolean, p_track_body_metrics boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set health_consent = p_consent,
      health_consent_at = now(),
      track_body_metrics = p_track_body_metrics
  where id = auth.uid();
$$;

revoke execute on function set_health_choices(boolean, boolean) from public, anon;
grant execute on function set_health_choices(boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Members' own writes
-- ----------------------------------------------------------------------------
drop policy "members submit own weekly checkins" on weekly_checkins;
create policy "members submit own weekly checkins"
  on weekly_checkins for insert
  with check (
    auth.uid() = member_id
    and has_health_consent(member_id)
    and (weight_kg is null or tracks_body_metrics(member_id))
  );

drop policy "members edit own weekly checkins" on weekly_checkins;
create policy "members edit own weekly checkins"
  on weekly_checkins for update
  using (auth.uid() = member_id)
  with check (
    auth.uid() = member_id
    and has_health_consent(member_id)
    and (weight_kg is null or tracks_body_metrics(member_id))
  );

drop policy "members submit own checkin" on readiness_checkins;
create policy "members submit own checkin"
  on readiness_checkins for insert
  with check (auth.uid() = member_id and has_health_consent(member_id));

drop policy "members log own body metrics" on body_metrics;
create policy "members log own body metrics"
  on body_metrics for insert
  with check (auth.uid() = member_id and tracks_body_metrics(member_id));

drop policy "members log own habits today" on habit_logs;
create policy "members log own habits today"
  on habit_logs for insert
  with check (auth.uid() = member_id and log_date = current_date and has_health_consent(member_id));

-- Was one "for all" policy; split so reading and deleting your own goals
-- never needs consent, but creating or changing one does.
drop policy "members manage own goals" on goals;
create policy "members read own goals"
  on goals for select
  using (auth.uid() = member_id);
create policy "members delete own goals"
  on goals for delete
  using (auth.uid() = member_id);
create policy "members create own goals"
  on goals for insert
  with check (auth.uid() = member_id and has_health_consent(member_id));
create policy "members edit own goals"
  on goals for update
  using (auth.uid() = member_id)
  with check (auth.uid() = member_id and has_health_consent(member_id));

-- ----------------------------------------------------------------------------
-- Staff reads (0042's switches, plus the member's consent)
-- ----------------------------------------------------------------------------
drop policy "coaches and owner read all weekly checkins" on weekly_checkins;
create policy "coaches and owner read all weekly checkins"
  on weekly_checkins for select
  using (staff_can_view('checkins') and has_health_consent(member_id));

drop policy "coaches and owner read all checkins" on readiness_checkins;
create policy "coaches and owner read all checkins"
  on readiness_checkins for select
  using (staff_can_view('checkins') and has_health_consent(member_id));

drop policy "coaches and owner read all body metrics" on body_metrics;
create policy "coaches and owner read all body metrics"
  on body_metrics for select
  using (staff_can_view('checkins') and tracks_body_metrics(member_id));

drop policy "coaches and owner read all habit logs" on habit_logs;
create policy "coaches and owner read all habit logs"
  on habit_logs for select
  using (staff_can_view('checkins') and has_health_consent(member_id));

drop policy "coaches and owner read all goals" on goals;
create policy "coaches and owner read all goals"
  on goals for select
  using (staff_can_view('checkins') and has_health_consent(member_id));
