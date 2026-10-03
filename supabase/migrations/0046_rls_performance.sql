-- ============================================================================
-- 0046_rls_performance.sql
-- Clears the Supabase Performance Advisor warnings without changing who
-- can see or do what. Generated from the policies as of 0045 (the
-- generator's view was checked against the Advisor's own list first).
--
--  1. auth.uid() -> (select auth.uid()): worked out once per query, not
--     once per row (lint 0003). Same value.
--  2. One policy per table per action (lint 0006). Postgres already ORs
--     permissive policies together, so "A OR B" in one policy is exactly
--     the old rules. Where an old policy had no WITH CHECK, its USING is
--     what Postgres checked, so that's what's ORed in.
--  3. Every policy is TO authenticated. Signed out has had nothing since
--     0045 (the helpers aren't executable by anon); the service role skips
--     RLS anyway.
--
-- Each policy lists the rules it replaces — those are the names older
-- comments in the code refer to.
-- ============================================================================

begin;


-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy "members read own profile" on profiles;
drop policy "coaches and owner read all profiles" on profiles;
drop policy "members update own profile" on profiles;
drop policy "owner manages all profiles" on profiles;
drop policy "members insert own profile" on profiles;
drop policy "members read waitlist buddy profiles" on profiles;
drop policy "members read buddy profiles for booking invites" on profiles;
-- Replaces: "members read own profile"; "coaches and owner read all profiles"; "owner manages all profiles"; "members read waitlist buddy profiles"; "members read buddy profiles for booking invites"
create policy "profiles: read"
  on profiles for select
  to authenticated
  using (
    ((select auth.uid()) = id)
    or (is_coach_or_owner())
    or (is_owner())
    or (exists ( select 1 from waitlist_entries where (member_id = (select auth.uid()) and buddy_member_id = profiles.id) or (buddy_member_id = (select auth.uid()) and member_id = profiles.id) ))
    or (exists ( select 1 from bookings where (member_id = (select auth.uid()) and invited_by = profiles.id) or (invited_by = (select auth.uid()) and member_id = profiles.id) ))
  );
-- Replaces: "owner manages all profiles"; "members insert own profile"
create policy "profiles: create"
  on profiles for insert
  to authenticated
  with check (
    (is_owner())
    or ((select auth.uid()) = id and role = 'member')
  );
-- Replaces: "members update own profile"; "owner manages all profiles"
create policy "profiles: change"
  on profiles for update
  to authenticated
  using (
    ((select auth.uid()) = id)
    or (is_owner())
  )
  with check (
    ((select auth.uid()) = id and role = 'member')
    or (is_owner())
  );
-- Replaces: "owner manages all profiles"
create policy "profiles: delete"
  on profiles for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- membership_plans
-- ----------------------------------------------------------------------------
drop policy "authenticated users read plans" on membership_plans;
drop policy "owner manages plans" on membership_plans;
drop policy "owner updates plans" on membership_plans;
-- Replaces: "authenticated users read plans"
create policy "membership_plans: read"
  on membership_plans for select
  to authenticated
  using (
    true
  );
-- Replaces: "owner manages plans"
create policy "membership_plans: create"
  on membership_plans for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner updates plans"
create policy "membership_plans: change"
  on membership_plans for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- member_memberships
-- ----------------------------------------------------------------------------
drop policy "members read own membership" on member_memberships;
drop policy "coaches and owner read all memberships" on member_memberships;
drop policy "owner manages memberships" on member_memberships;
-- Replaces: "members read own membership"; "coaches and owner read all memberships"; "owner manages memberships"
create policy "member_memberships: read"
  on member_memberships for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (is_coach_or_owner())
    or (is_owner())
  );
-- Replaces: "owner manages memberships"
create policy "member_memberships: create"
  on member_memberships for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages memberships"
create policy "member_memberships: change"
  on member_memberships for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages memberships"
create policy "member_memberships: delete"
  on member_memberships for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- credit_ledger
-- ----------------------------------------------------------------------------
drop policy "members read own credit history" on credit_ledger;
drop policy "coaches and owner read all credit history" on credit_ledger;
-- Replaces: "members read own credit history"; "coaches and owner read all credit history"
create policy "credit_ledger: read"
  on credit_ledger for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (is_coach_or_owner())
  );

-- ----------------------------------------------------------------------------
-- session_templates
-- ----------------------------------------------------------------------------
drop policy "authenticated users read templates" on session_templates;
drop policy "owner manages classes" on session_templates;
-- Replaces: "authenticated users read templates"; "owner manages classes"
create policy "session_templates: read"
  on session_templates for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages classes"
create policy "session_templates: create"
  on session_templates for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages classes"
create policy "session_templates: change"
  on session_templates for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages classes"
create policy "session_templates: delete"
  on session_templates for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- sessions
-- ----------------------------------------------------------------------------
drop policy "authenticated users read sessions" on sessions;
drop policy "owner manages sessions" on sessions;
-- Replaces: "authenticated users read sessions"; "owner manages sessions"
create policy "sessions: read"
  on sessions for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages sessions"
create policy "sessions: create"
  on sessions for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages sessions"
create policy "sessions: change"
  on sessions for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages sessions"
create policy "sessions: delete"
  on sessions for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- session_plans
-- ----------------------------------------------------------------------------
drop policy "members read published plans" on session_plans;
drop policy "owner manages plans" on session_plans;
-- Replaces: "members read published plans"; "owner manages plans"
create policy "session_plans: read"
  on session_plans for select
  to authenticated
  using (
    (is_published = true or is_coach_or_owner())
    or (is_owner())
  );
-- Replaces: "owner manages plans"
create policy "session_plans: create"
  on session_plans for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages plans"
create policy "session_plans: change"
  on session_plans for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages plans"
create policy "session_plans: delete"
  on session_plans for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- bookings
-- ----------------------------------------------------------------------------
drop policy "members read own bookings" on bookings;
drop policy "members read invites they sent" on bookings;
drop policy "owner updates any booking" on bookings;
drop policy "coaches and owner read all bookings" on bookings;
drop policy "coaches mark attendance on their own sessions" on bookings;
-- Replaces: "members read own bookings"; "members read invites they sent"; "coaches and owner read all bookings"
create policy "bookings: read"
  on bookings for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or ((select auth.uid()) = invited_by)
    or (staff_can_view('today'))
  );
-- Replaces: "owner updates any booking"; "coaches mark attendance on their own sessions"
create policy "bookings: change"
  on bookings for update
  to authenticated
  using (
    (is_owner())
    or (staff_can_view('today') and exists (select 1 from sessions s where s.id = bookings.session_id and s.coach_id = (select auth.uid())))
  )
  with check (
    (is_owner())
    or (status in ('attended', 'no_show', 'excused'))
  );

-- ----------------------------------------------------------------------------
-- waitlist_entries
-- ----------------------------------------------------------------------------
drop policy "members read own waitlist entries" on waitlist_entries;
drop policy "coaches and owner read all waitlist entries" on waitlist_entries;
-- Replaces: "members read own waitlist entries"; "coaches and owner read all waitlist entries"
create policy "waitlist_entries: read"
  on waitlist_entries for select
  to authenticated
  using (
    ((select auth.uid()) = member_id or (select auth.uid()) = buddy_member_id)
    or (is_coach_or_owner())
  );

-- ----------------------------------------------------------------------------
-- readiness_checkins
-- ----------------------------------------------------------------------------
drop policy "members read own checkins" on readiness_checkins;
drop policy "members submit own checkin" on readiness_checkins;
drop policy "coaches and owner read all checkins" on readiness_checkins;
-- Replaces: "members read own checkins"; "coaches and owner read all checkins"
create policy "readiness_checkins: read"
  on readiness_checkins for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (staff_can_view('checkins') and has_health_consent(member_id))
  );
-- Replaces: "members submit own checkin"
create policy "readiness_checkins: create"
  on readiness_checkins for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id and has_health_consent(member_id)
  );

-- ----------------------------------------------------------------------------
-- session_notes
-- ----------------------------------------------------------------------------
drop policy "members read own notes" on session_notes;
drop policy "coaches and owner read all notes" on session_notes;
drop policy "coaches and owner write notes" on session_notes;
-- Replaces: "members read own notes"; "coaches and owner read all notes"
create policy "session_notes: read"
  on session_notes for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (is_coach_or_owner())
  );
-- Replaces: "coaches and owner write notes"
create policy "session_notes: create"
  on session_notes for insert
  to authenticated
  with check (
    is_coach_or_owner()
  );

-- ----------------------------------------------------------------------------
-- session_feedback
-- ----------------------------------------------------------------------------
drop policy "owner reads all feedback" on session_feedback;
drop policy "members submit own feedback" on session_feedback;
-- Replaces: "owner reads all feedback"
create policy "session_feedback: read"
  on session_feedback for select
  to authenticated
  using (
    is_owner()
  );
-- Replaces: "members submit own feedback"
create policy "session_feedback: create"
  on session_feedback for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id
  );

-- ----------------------------------------------------------------------------
-- challenges
-- ----------------------------------------------------------------------------
drop policy "authenticated users read challenges" on challenges;
drop policy "owner manages challenges" on challenges;
-- Replaces: "authenticated users read challenges"; "owner manages challenges"
create policy "challenges: read"
  on challenges for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages challenges"
create policy "challenges: create"
  on challenges for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages challenges"
create policy "challenges: change"
  on challenges for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages challenges"
create policy "challenges: delete"
  on challenges for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- challenge_participants
-- ----------------------------------------------------------------------------
drop policy "authenticated users read participants" on challenge_participants;
drop policy "members join open challenges" on challenge_participants;
drop policy "owner adds any participant" on challenge_participants;
-- Replaces: "authenticated users read participants"
create policy "challenge_participants: read"
  on challenge_participants for select
  to authenticated
  using (
    true
  );
-- Replaces: "members join open challenges"; "owner adds any participant"
create policy "challenge_participants: create"
  on challenge_participants for insert
  to authenticated
  with check (
    ((select auth.uid()) = member_id and exists ( select 1 from challenges where id = challenge_id and is_open = true ))
    or (is_owner())
  );

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------
drop policy "authenticated users read events" on events;
drop policy "members post their own events" on events;
drop policy "owner posts gym events" on events;
drop policy "creator or owner edits event" on events;
-- Replaces: "authenticated users read events"
create policy "events: read"
  on events for select
  to authenticated
  using (
    true
  );
-- Replaces: "members post their own events"; "owner posts gym events"
create policy "events: create"
  on events for insert
  to authenticated
  with check (
    ((select auth.uid()) = created_by and event_type = 'member_posted')
    or (is_owner() and event_type = 'gym')
  );
-- Replaces: "creator or owner edits event"
create policy "events: change"
  on events for update
  to authenticated
  using (
    (select auth.uid()) = created_by or is_owner()
  )
  with check (
    is_owner() or ((select auth.uid()) = created_by and event_type = 'member_posted')
  );

-- ----------------------------------------------------------------------------
-- event_interests
-- ----------------------------------------------------------------------------
drop policy "authenticated users read interests" on event_interests;
drop policy "members express own interest" on event_interests;
-- Replaces: "authenticated users read interests"
create policy "event_interests: read"
  on event_interests for select
  to authenticated
  using (
    true
  );
-- Replaces: "members express own interest"
create policy "event_interests: create"
  on event_interests for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id
  );

-- ----------------------------------------------------------------------------
-- coach_ted_knowledge_base
-- ----------------------------------------------------------------------------
drop policy "owner reads knowledge base" on coach_ted_knowledge_base;
drop policy "owner manages knowledge base" on coach_ted_knowledge_base;
-- Replaces: "owner reads knowledge base"; "owner manages knowledge base"
create policy "coach_ted_knowledge_base: read"
  on coach_ted_knowledge_base for select
  to authenticated
  using (
    (is_owner())
    or (is_owner())
  );
-- Replaces: "owner manages knowledge base"
create policy "coach_ted_knowledge_base: create"
  on coach_ted_knowledge_base for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages knowledge base"
create policy "coach_ted_knowledge_base: change"
  on coach_ted_knowledge_base for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages knowledge base"
create policy "coach_ted_knowledge_base: delete"
  on coach_ted_knowledge_base for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- coach_ted_qa_cache
-- ----------------------------------------------------------------------------
drop policy "owner reads qa cache" on coach_ted_qa_cache;
drop policy "owner moderates qa cache" on coach_ted_qa_cache;
drop policy "owner adds qa cache answers" on coach_ted_qa_cache;
drop policy "owner deletes qa cache answers" on coach_ted_qa_cache;
-- Replaces: "owner reads qa cache"
create policy "coach_ted_qa_cache: read"
  on coach_ted_qa_cache for select
  to authenticated
  using (
    is_owner()
  );
-- Replaces: "owner adds qa cache answers"
create policy "coach_ted_qa_cache: create"
  on coach_ted_qa_cache for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner moderates qa cache"
create policy "coach_ted_qa_cache: change"
  on coach_ted_qa_cache for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner deletes qa cache answers"
create policy "coach_ted_qa_cache: delete"
  on coach_ted_qa_cache for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- coach_ted_conversations
-- ----------------------------------------------------------------------------
drop policy "members read own ted conversations" on coach_ted_conversations;
drop policy "owner reads all ted conversations" on coach_ted_conversations;
-- Replaces: "members read own ted conversations"; "owner reads all ted conversations"
create policy "coach_ted_conversations: read"
  on coach_ted_conversations for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (is_owner())
  );

-- ----------------------------------------------------------------------------
-- habit_definitions
-- ----------------------------------------------------------------------------
drop policy "authenticated users read habit definitions" on habit_definitions;
drop policy "owner manages habit definitions" on habit_definitions;
-- Replaces: "authenticated users read habit definitions"; "owner manages habit definitions"
create policy "habit_definitions: read"
  on habit_definitions for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages habit definitions"
create policy "habit_definitions: create"
  on habit_definitions for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages habit definitions"
create policy "habit_definitions: change"
  on habit_definitions for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages habit definitions"
create policy "habit_definitions: delete"
  on habit_definitions for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- habit_logs
-- ----------------------------------------------------------------------------
drop policy "members read own habit logs" on habit_logs;
drop policy "members unlog own habits today" on habit_logs;
drop policy "members log own habits today" on habit_logs;
drop policy "coaches and owner read all habit logs" on habit_logs;
-- Replaces: "members read own habit logs"; "coaches and owner read all habit logs"
create policy "habit_logs: read"
  on habit_logs for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (staff_can_view('checkins') and has_health_consent(member_id))
  );
-- Replaces: "members log own habits today"
create policy "habit_logs: create"
  on habit_logs for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id and log_date = current_date and has_health_consent(member_id)
  );
-- Replaces: "members unlog own habits today"
create policy "habit_logs: delete"
  on habit_logs for delete
  to authenticated
  using (
    (select auth.uid()) = member_id and log_date = current_date
  );

-- ----------------------------------------------------------------------------
-- session_segments
-- ----------------------------------------------------------------------------
drop policy "authenticated users read session segments" on session_segments;
drop policy "owner manages session segments" on session_segments;
-- Replaces: "authenticated users read session segments"; "owner manages session segments"
create policy "session_segments: read"
  on session_segments for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages session segments"
create policy "session_segments: create"
  on session_segments for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages session segments"
create policy "session_segments: change"
  on session_segments for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages session segments"
create policy "session_segments: delete"
  on session_segments for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- session_exercises
-- ----------------------------------------------------------------------------
drop policy "authenticated users read session exercises" on session_exercises;
drop policy "owner manages session exercises" on session_exercises;
-- Replaces: "authenticated users read session exercises"; "owner manages session exercises"
create policy "session_exercises: read"
  on session_exercises for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages session exercises"
create policy "session_exercises: create"
  on session_exercises for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages session exercises"
create policy "session_exercises: change"
  on session_exercises for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages session exercises"
create policy "session_exercises: delete"
  on session_exercises for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- exercise_logs
-- ----------------------------------------------------------------------------
drop policy "members read own exercise logs" on exercise_logs;
drop policy "coaches and owner read all exercise logs" on exercise_logs;
drop policy "members log own exercises" on exercise_logs;
drop policy "members correct own exercise logs" on exercise_logs;
-- Replaces: "members read own exercise logs"; "coaches and owner read all exercise logs"
create policy "exercise_logs: read"
  on exercise_logs for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (is_coach_or_owner())
  );
-- Replaces: "members log own exercises"
create policy "exercise_logs: create"
  on exercise_logs for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id
  );
-- Replaces: "members correct own exercise logs"
create policy "exercise_logs: change"
  on exercise_logs for update
  to authenticated
  using (
    (select auth.uid()) = member_id
  )
  with check (
    (select auth.uid()) = member_id
  );

-- ----------------------------------------------------------------------------
-- body_metrics
-- ----------------------------------------------------------------------------
drop policy "members read own body metrics" on body_metrics;
drop policy "members log own body metrics" on body_metrics;
drop policy "coaches and owner read all body metrics" on body_metrics;
-- Replaces: "members read own body metrics"; "coaches and owner read all body metrics"
create policy "body_metrics: read"
  on body_metrics for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (staff_can_view('checkins') and tracks_body_metrics(member_id))
  );
-- Replaces: "members log own body metrics"
create policy "body_metrics: create"
  on body_metrics for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id and tracks_body_metrics(member_id)
  );

-- ----------------------------------------------------------------------------
-- workout_templates
-- ----------------------------------------------------------------------------
drop policy "authenticated users read workout templates" on workout_templates;
drop policy "owner manages workout templates" on workout_templates;
-- Replaces: "authenticated users read workout templates"; "owner manages workout templates"
create policy "workout_templates: read"
  on workout_templates for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages workout templates"
create policy "workout_templates: create"
  on workout_templates for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages workout templates"
create policy "workout_templates: change"
  on workout_templates for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages workout templates"
create policy "workout_templates: delete"
  on workout_templates for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- template_segments
-- ----------------------------------------------------------------------------
drop policy "authenticated users read template segments" on template_segments;
drop policy "owner manages template segments" on template_segments;
-- Replaces: "authenticated users read template segments"; "owner manages template segments"
create policy "template_segments: read"
  on template_segments for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages template segments"
create policy "template_segments: create"
  on template_segments for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages template segments"
create policy "template_segments: change"
  on template_segments for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages template segments"
create policy "template_segments: delete"
  on template_segments for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- template_exercises
-- ----------------------------------------------------------------------------
drop policy "authenticated users read template exercises" on template_exercises;
drop policy "owner manages template exercises" on template_exercises;
-- Replaces: "authenticated users read template exercises"; "owner manages template exercises"
create policy "template_exercises: read"
  on template_exercises for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages template exercises"
create policy "template_exercises: create"
  on template_exercises for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages template exercises"
create policy "template_exercises: change"
  on template_exercises for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages template exercises"
create policy "template_exercises: delete"
  on template_exercises for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- session_exercise_sets
-- ----------------------------------------------------------------------------
drop policy "authenticated users read session exercise sets" on session_exercise_sets;
drop policy "owner manages session exercise sets" on session_exercise_sets;
-- Replaces: "authenticated users read session exercise sets"; "owner manages session exercise sets"
create policy "session_exercise_sets: read"
  on session_exercise_sets for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages session exercise sets"
create policy "session_exercise_sets: create"
  on session_exercise_sets for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages session exercise sets"
create policy "session_exercise_sets: change"
  on session_exercise_sets for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages session exercise sets"
create policy "session_exercise_sets: delete"
  on session_exercise_sets for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- template_exercise_sets
-- ----------------------------------------------------------------------------
drop policy "authenticated users read template exercise sets" on template_exercise_sets;
drop policy "owner manages template exercise sets" on template_exercise_sets;
-- Replaces: "authenticated users read template exercise sets"; "owner manages template exercise sets"
create policy "template_exercise_sets: read"
  on template_exercise_sets for select
  to authenticated
  using (
    (true)
    or (is_owner())
  );
-- Replaces: "owner manages template exercise sets"
create policy "template_exercise_sets: create"
  on template_exercise_sets for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages template exercise sets"
create policy "template_exercise_sets: change"
  on template_exercise_sets for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages template exercise sets"
create policy "template_exercise_sets: delete"
  on template_exercise_sets for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- email_log
-- ----------------------------------------------------------------------------
drop policy "owner reads email log" on email_log;
-- Replaces: "owner reads email log"
create policy "email_log: read"
  on email_log for select
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- weekly_checkins
-- ----------------------------------------------------------------------------
drop policy "members read own weekly checkins" on weekly_checkins;
drop policy "members submit own weekly checkins" on weekly_checkins;
drop policy "members edit own weekly checkins" on weekly_checkins;
drop policy "coaches and owner read all weekly checkins" on weekly_checkins;
-- Replaces: "members read own weekly checkins"; "coaches and owner read all weekly checkins"
create policy "weekly_checkins: read"
  on weekly_checkins for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (staff_can_view('checkins') and has_health_consent(member_id))
  );
-- Replaces: "members submit own weekly checkins"
create policy "weekly_checkins: create"
  on weekly_checkins for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id and has_health_consent(member_id) and (weight_kg is null or tracks_body_metrics(member_id))
  );
-- Replaces: "members edit own weekly checkins"
create policy "weekly_checkins: change"
  on weekly_checkins for update
  to authenticated
  using (
    (select auth.uid()) = member_id
  )
  with check (
    (select auth.uid()) = member_id and has_health_consent(member_id) and (weight_kg is null or tracks_body_metrics(member_id))
  );

-- ----------------------------------------------------------------------------
-- coach_time_off
-- ----------------------------------------------------------------------------
drop policy "owner manages coach time off" on coach_time_off;
drop policy "coaches read own time off" on coach_time_off;
-- Replaces: "owner manages coach time off"; "coaches read own time off"
create policy "coach_time_off: read"
  on coach_time_off for select
  to authenticated
  using (
    (is_owner())
    or ((select auth.uid()) = coach_id)
  );
-- Replaces: "owner manages coach time off"
create policy "coach_time_off: create"
  on coach_time_off for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages coach time off"
create policy "coach_time_off: change"
  on coach_time_off for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages coach time off"
create policy "coach_time_off: delete"
  on coach_time_off for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- calendar_feed_tokens
-- ----------------------------------------------------------------------------
drop policy "people manage their own calendar feed token" on calendar_feed_tokens;
-- Replaces: "people manage their own calendar feed token"
create policy "calendar_feed_tokens: read"
  on calendar_feed_tokens for select
  to authenticated
  using (
    (select auth.uid()) = profile_id
  );
-- Replaces: "people manage their own calendar feed token"
create policy "calendar_feed_tokens: create"
  on calendar_feed_tokens for insert
  to authenticated
  with check (
    (select auth.uid()) = profile_id
  );
-- Replaces: "people manage their own calendar feed token"
create policy "calendar_feed_tokens: change"
  on calendar_feed_tokens for update
  to authenticated
  using (
    (select auth.uid()) = profile_id
  )
  with check (
    (select auth.uid()) = profile_id
  );
-- Replaces: "people manage their own calendar feed token"
create policy "calendar_feed_tokens: delete"
  on calendar_feed_tokens for delete
  to authenticated
  using (
    (select auth.uid()) = profile_id
  );

-- ----------------------------------------------------------------------------
-- programme_followups
-- ----------------------------------------------------------------------------
drop policy "owner reads programme followups" on programme_followups;
drop policy "owner inserts programme followups" on programme_followups;
drop policy "owner updates programme followups" on programme_followups;
drop policy "owner deletes programme followups" on programme_followups;
-- Replaces: "owner reads programme followups"
create policy "programme_followups: read"
  on programme_followups for select
  to authenticated
  using (
    is_owner()
  );
-- Replaces: "owner inserts programme followups"
create policy "programme_followups: create"
  on programme_followups for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner updates programme followups"
create policy "programme_followups: change"
  on programme_followups for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner deletes programme followups"
create policy "programme_followups: delete"
  on programme_followups for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- coach_ted_usage
-- ----------------------------------------------------------------------------
drop policy "owner reads ted usage" on coach_ted_usage;
-- Replaces: "owner reads ted usage"
create policy "coach_ted_usage: read"
  on coach_ted_usage for select
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- coach_permissions
-- ----------------------------------------------------------------------------
drop policy "owner manages coach permissions" on coach_permissions;
drop policy "coaches read own permissions" on coach_permissions;
-- Replaces: "owner manages coach permissions"; "coaches read own permissions"
create policy "coach_permissions: read"
  on coach_permissions for select
  to authenticated
  using (
    (is_owner())
    or ((select auth.uid()) = coach_id)
  );
-- Replaces: "owner manages coach permissions"
create policy "coach_permissions: create"
  on coach_permissions for insert
  to authenticated
  with check (
    is_owner()
  );
-- Replaces: "owner manages coach permissions"
create policy "coach_permissions: change"
  on coach_permissions for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );
-- Replaces: "owner manages coach permissions"
create policy "coach_permissions: delete"
  on coach_permissions for delete
  to authenticated
  using (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- goals
-- ----------------------------------------------------------------------------
drop policy "members read own goals" on goals;
drop policy "members delete own goals" on goals;
drop policy "members create own goals" on goals;
drop policy "members edit own goals" on goals;
drop policy "coaches and owner read all goals" on goals;
-- Replaces: "members read own goals"; "coaches and owner read all goals"
create policy "goals: read"
  on goals for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (staff_can_view('checkins') and has_health_consent(member_id))
  );
-- Replaces: "members create own goals"
create policy "goals: create"
  on goals for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id and has_health_consent(member_id)
  );
-- Replaces: "members edit own goals"
create policy "goals: change"
  on goals for update
  to authenticated
  using (
    (select auth.uid()) = member_id
  )
  with check (
    (select auth.uid()) = member_id and has_health_consent(member_id)
  );
-- Replaces: "members delete own goals"
create policy "goals: delete"
  on goals for delete
  to authenticated
  using (
    (select auth.uid()) = member_id
  );

commit;
