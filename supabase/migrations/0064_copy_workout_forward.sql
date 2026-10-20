-- ============================================================================
-- 0064_copy_workout_forward.sql
-- "This and every later Tuesday 06:00" for workouts (Guy, 2026-10-20). He
-- schedules a slot for up to 52 weeks (e.g. GCP 1, Tuesdays 06:00) and
-- edits or cancels the whole run at once instead of class by class. Cancel
-- and change coach are app-side (schedule-actions.ts); the workout copy is
-- here for the same reason as copy_week_workouts (0063): a year of one
-- slot is thousands of rows, so one call, one transaction, no Vercel
-- timeout halfway.
--
-- Rules:
--   - Targets: scheduled classes after the source's date with the same
--     class type, start time and weekday.
--   - Any workout already on a target is replaced — that's the point.
--   - Never replaced: a workout members have already logged sets against
--     (deleting the exercises cascades to their logs, 0015). Counted as kept.
--   - A source with no workout is refused, so this can't wipe a year of
--     workouts by accident.
--
-- security invoker: runs as the caller, so the owner-only write policies
-- on session_segments / session_exercises / session_exercise_sets
-- ("<table>: create|delete", 0046) are what authorize it. No new tables.
-- Run AFTER 0063.
-- ============================================================================

create or replace function copy_workout_forward(p_source_session uuid)
returns table (copied integer, kept integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source record;
  v_target_id uuid;
  v_segment record;
  v_new_segment uuid;
  v_exercise record;
  v_new_exercise uuid;
  v_copied integer := 0;
  v_kept integer := 0;
begin
  if not is_owner() then
    raise exception 'Only the owner can copy workouts' using errcode = '42501';
  end if;

  select s.id, s.template_id, s.start_time, s.session_date into v_source
  from sessions s
  where s.id = p_source_session;

  if v_source.id is null then
    raise exception 'Class not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from session_segments where session_id = v_source.id) then
    raise exception 'That class has no workout to copy' using errcode = '22023';
  end if;

  for v_target_id in
    select t.id
    from sessions t
    where t.status = 'scheduled'
      and t.template_id = v_source.template_id
      and t.start_time = v_source.start_time
      and t.session_date > v_source.session_date
      and extract(dow from t.session_date) = extract(dow from v_source.session_date)
    order by t.session_date
  loop
    if exists (
      select 1
      from exercise_logs l
      join session_exercises x on x.id = l.exercise_id
      join session_segments g on g.id = x.segment_id
      where g.session_id = v_target_id
    ) then
      v_kept := v_kept + 1;
      continue;
    end if;

    delete from session_segments where session_id = v_target_id;

    for v_segment in
      select * from session_segments where session_id = v_source.id order by sort_order
    loop
      insert into session_segments (session_id, type, label, default_rounds, is_scored, sort_order)
      values (v_target_id, v_segment.type, v_segment.label, v_segment.default_rounds, v_segment.is_scored, v_segment.sort_order)
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

    v_copied := v_copied + 1;
  end loop;

  return query select v_copied, v_kept;
end;
$$;

comment on function copy_workout_forward(uuid) is
  'Programme calendar: one class''s workout onto every later class with the same type, weekday and time. Owner only (RLS, security invoker). Never replaces a workout members have logged.';

revoke execute on function copy_workout_forward(uuid) from public, anon;
grant execute on function copy_workout_forward(uuid) to authenticated;
