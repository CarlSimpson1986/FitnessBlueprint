-- ============================================================================
-- 0066_part_scores.sql
-- One score per member for a text part (Guy, 2026-10-24). A text part
-- (0065) gets a score type:
--   none        — the text only (default; every existing part)
--   notes       — an optional free box ("Z press 20kg, calves 3x20"),
--                 for accessories; never ranked
--   rounds_reps — AMRAP: rounds + extra reps
--   time        — for time: seconds
-- rounds_reps and time are what a leaderboard will rank later; there's no
-- leaderboard yet (ranking and opt-out still need Guy's answer).
--
-- RLS ships here, same shape as exercise_logs (0046): a member reads,
-- adds and corrects their own; coaches and the owner read all (Carl,
-- 2026-10-24 — scores are workout data like logs, not health data or
-- session_feedback). Staff never write members' scores.
--
-- Also recreates:
--   - copy_session_workout (0065) to copy score_type;
--   - session_has_logs (0065) so a class with scores counts as logged —
--     Copy week / every later / same day never wipe members' scores.
-- Run AFTER 0065.
-- ============================================================================

alter table session_segments
  add column score_type text not null default 'none'
  check (score_type in ('none', 'notes', 'rounds_reps', 'time'));
alter table template_segments
  add column score_type text not null default 'none'
  check (score_type in ('none', 'notes', 'rounds_reps', 'time'));

comment on column session_segments.score_type is
  'Text parts only (0065): what members enter for the whole part — none, notes, rounds_reps (AMRAP) or time (for time).';
comment on column template_segments.score_type is
  'Copied to session_segments.score_type when the template is assigned.';

create table segment_scores (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references session_segments (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  rounds integer check (rounds >= 0),
  reps integer check (reps >= 0),
  time_seconds integer check (time_seconds > 0),
  notes text,
  logged_at timestamptz not null default now(),
  constraint segment_scores_has_a_value check (
    rounds is not null or reps is not null or time_seconds is not null or nullif(trim(notes), '') is not null
  ),
  unique (segment_id, member_id)
);

comment on table segment_scores is
  'A member''s one score for a text part (AMRAP rounds + reps, a time, or free notes). Only the column(s) matching the part''s score_type get filled — app-enforced.';

create index idx_segment_scores_member on segment_scores (member_id, logged_at desc);

alter table segment_scores enable row level security;

create policy "segment_scores: read"
  on segment_scores for select
  to authenticated
  using (
    ((select auth.uid()) = member_id)
    or (is_coach_or_owner())
  );

create policy "segment_scores: create"
  on segment_scores for insert
  to authenticated
  with check (
    (select auth.uid()) = member_id
  );

create policy "segment_scores: change"
  on segment_scores for update
  to authenticated
  using (
    (select auth.uid()) = member_id
  )
  with check (
    (select auth.uid()) = member_id
  );

-- A member clearing their score deletes the row (the has-a-value check
-- forbids an empty one).
create policy "segment_scores: delete"
  on segment_scores for delete
  to authenticated
  using (
    (select auth.uid()) = member_id
  );

-- ----------------------------------------------------------------------------
-- copy_session_workout (0065), now copying score_type.
-- ----------------------------------------------------------------------------
create or replace function copy_session_workout(p_source uuid, p_target uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_segment record;
  v_new_segment uuid;
  v_exercise record;
  v_new_exercise uuid;
begin
  delete from session_segments where session_id = p_target;

  for v_segment in
    select * from session_segments where session_id = p_source order by sort_order
  loop
    insert into session_segments (session_id, type, label, default_rounds, is_scored, text_content, score_type, sort_order)
    values (p_target, v_segment.type, v_segment.label, v_segment.default_rounds, v_segment.is_scored,
            v_segment.text_content, v_segment.score_type, v_segment.sort_order)
    returning id into v_new_segment;

    for v_exercise in
      select * from session_exercises where segment_id = v_segment.id order by sort_order
    loop
      insert into session_exercises (segment_id, name, metric_type, each_side, tempo, note, video_url, sort_order)
      values (v_new_segment, v_exercise.name, v_exercise.metric_type, v_exercise.each_side, v_exercise.tempo,
              v_exercise.note, v_exercise.video_url, v_exercise.sort_order)
      returning id into v_new_exercise;

      insert into session_exercise_sets (exercise_id, set_number, target, rest_seconds, intensity_type, intensity_value, sort_order)
      select v_new_exercise, st.set_number, st.target, st.rest_seconds, st.intensity_type, st.intensity_value, st.sort_order
      from session_exercise_sets st
      where st.exercise_id = v_exercise.id;
    end loop;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- session_has_logs (0065), now also true when a member has entered a
-- part score. Security invoker: the owner (the only caller, via the copy
-- functions) reads all scores under "segment_scores: read".
-- ----------------------------------------------------------------------------
create or replace function session_has_logs(p_session uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from exercise_logs l
    join session_exercises x on x.id = l.exercise_id
    join session_segments g on g.id = x.segment_id
    where g.session_id = p_session
  ) or exists (
    select 1
    from segment_scores sc
    join session_segments g on g.id = sc.segment_id
    where g.session_id = p_session
  );
$$;
