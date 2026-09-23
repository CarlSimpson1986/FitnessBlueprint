-- ============================================================================
-- 0024 — Only the owner creates or changes the program.
--
-- Confirmed by the owner: Guy is the only person who creates things.
-- Coaches are viewers of the program and attendance trackers — they see
-- sessions, workouts, who's attending and readiness, and mark attendance,
-- but never create/edit classes, sessions, workouts, templates,
-- challenges or events.
--
-- Every "coaches and owner manage X" write policy below becomes
-- owner-only. Read policies are untouched (coaches keep seeing
-- everything they saw before). Attendance: coaches can now only update
-- bookings on sessions they're coaching; the owner can update any.
-- ============================================================================

-- Classes (session_templates)
drop policy "coaches and owner manage templates" on session_templates;
create policy "owner manages classes"
  on session_templates for all
  using (is_owner())
  with check (is_owner());

-- Timetable (sessions)
drop policy "coaches and owner manage sessions" on sessions;
create policy "owner manages sessions"
  on sessions for all
  using (is_owner())
  with check (is_owner());

-- Legacy text plans
drop policy "coaches and owner manage plans" on session_plans;
create policy "owner manages plans"
  on session_plans for all
  using (is_owner())
  with check (is_owner());

-- Session workout content
drop policy "coaches and owner manage session segments" on session_segments;
create policy "owner manages session segments"
  on session_segments for all
  using (is_owner())
  with check (is_owner());

drop policy "coaches and owner manage session exercises" on session_exercises;
create policy "owner manages session exercises"
  on session_exercises for all
  using (is_owner())
  with check (is_owner());

drop policy "coaches and owner manage session exercise sets" on session_exercise_sets;
create policy "owner manages session exercise sets"
  on session_exercise_sets for all
  using (is_owner())
  with check (is_owner());

-- Workout template library
drop policy "coaches and owner manage workout templates" on workout_templates;
create policy "owner manages workout templates"
  on workout_templates for all
  using (is_owner())
  with check (is_owner());

drop policy "coaches and owner manage template segments" on template_segments;
create policy "owner manages template segments"
  on template_segments for all
  using (is_owner())
  with check (is_owner());

drop policy "coaches and owner manage template exercises" on template_exercises;
create policy "owner manages template exercises"
  on template_exercises for all
  using (is_owner())
  with check (is_owner());

drop policy "coaches and owner manage template exercise sets" on template_exercise_sets;
create policy "owner manages template exercise sets"
  on template_exercise_sets for all
  using (is_owner())
  with check (is_owner());

-- Challenges
drop policy "coaches and owner manage challenges" on challenges;
create policy "owner manages challenges"
  on challenges for all
  using (is_owner())
  with check (is_owner());

drop policy "coaches and owner add any participant" on challenge_participants;
create policy "owner adds any participant"
  on challenge_participants for insert
  with check (is_owner());

-- Gym events (members can still post their own member_posted events)
drop policy "coaches and owner post gym events" on events;
create policy "owner posts gym events"
  on events for insert
  with check (is_owner() and event_type = 'gym');

-- Attendance: owner any booking, coaches only their own sessions'
drop policy "coaches and owner update any booking" on bookings;
create policy "owner updates any booking"
  on bookings for update
  using (is_owner());
create policy "coaches mark attendance on their own sessions"
  on bookings for update
  using (
    is_coach_or_owner()
    and exists (select 1 from sessions s where s.id = bookings.session_id and s.coach_id = auth.uid())
  )
  with check (status in ('attended', 'no_show', 'excused'));
