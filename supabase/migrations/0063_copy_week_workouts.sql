-- ============================================================================
-- 0063_copy_week_workouts.sql
-- "Copy week" on the programme calendar (Guy, 2026-10-14): build one week
-- of class workouts, paste it over the rest of the block, then tweak each
-- week by hand. Each workout goes onto the class with the same weekday,
-- class type and start time in every target week.
--
-- In the database rather than the app because a 10-week block is a few
-- thousand rows: one call, one transaction — it all copies or none of it
-- does, and it can't time out halfway on Vercel.
--
-- Rules:
--   - Workouts only. A class missing in a target week (bank holiday,
--     cancelled) is skipped and counted, never created.
--   - A target that already has a workout is kept unless p_replace.
--   - Never replaced, even with p_replace: a workout members have already
--     logged sets against — replacing deletes the exercises, and with them
--     (on delete cascade, 0015) the members' logs.
--
-- security invoker: runs as the caller, so the existing owner-only write
-- policies on session_segments / session_exercises / session_exercise_sets
-- ("<table>: create|delete", 0046) are what authorize it. No new tables.
-- Run AFTER 0062.
-- ============================================================================

create or replace function copy_week_workouts(p_source_week date, p_target_weeks date[], p_replace boolean)
returns table (copied integer, kept integer, no_class integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_week date;
  v_source record;
  v_target_id uuid;
  v_segment record;
  v_new_segment uuid;
  v_exercise record;
  v_new_exercise uuid;
  v_copied integer := 0;
  v_kept integer := 0;
  v_no_class integer := 0;
begin
  if not is_owner() then
    raise exception 'Only the owner can copy workouts' using errcode = '42501';
  end if;

  foreach v_week in array p_target_weeks loop
    continue when v_week = p_source_week;

    for v_source in
      select s.id, s.template_id, s.start_time, s.session_date - p_source_week as day_offset
      from sessions s
      where s.status = 'scheduled'
        and s.session_date between p_source_week and p_source_week + 6
        and exists (select 1 from session_segments g where g.session_id = s.id)
      order by s.session_date, s.start_time
    loop
      v_target_id := null;
      select t.id into v_target_id
      from sessions t
      where t.status = 'scheduled'
        and t.session_date = v_week + v_source.day_offset
        and t.template_id = v_source.template_id
        and t.start_time = v_source.start_time
      order by t.created_at
      limit 1;

      if v_target_id is null then
        v_no_class := v_no_class + 1;
        continue;
      end if;

      if exists (select 1 from session_segments where session_id = v_target_id) then
        if not p_replace or exists (
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
      end if;

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
  end loop;

  return query select v_copied, v_kept, v_no_class;
end;
$$;

comment on function copy_week_workouts(date, date[], boolean) is
  'Programme calendar "Copy week": one week''s class workouts onto the same class/day/time in each target week. Owner only (RLS, security invoker). Never replaces a workout members have logged.';

revoke execute on function copy_week_workouts(date, date[], boolean) from public, anon;
grant execute on function copy_week_workouts(date, date[], boolean) to authenticated;
