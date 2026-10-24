-- ============================================================================
-- 0065_text_parts_and_same_day_copy.sql
-- Two builder speed-ups from Guy (2026-10-24):
--
-- 1. Text-only parts. Accessories and conditioning are quicker typed as a
--    list ("Seated Z press 3x12 e/s / calf raises 3x20 / plank 3x60s") than
--    built exercise by exercise. A part with text_content set has no
--    exercises; members see the text as written. (A single score for a
--    text part, e.g. AMRAP rounds + reps, is waiting on Guy — not here.)
--
-- 2. "Every GCP class this Monday": one class's workout onto every other
--    scheduled class of the same type on the same date. Same rules as
--    copy_workout_forward (0064): targets are replaced, except one members
--    have already logged sets against (counted as kept).
--
-- The copy itself moves into copy_session_workout(), shared by Copy week
-- (0063), "and every later" (0064) and the new same-day copy, so all three
-- carry text_content. Their rules are unchanged.
--
-- All security invoker: runs as the caller, so the owner-only write
-- policies on session_segments / session_exercises / session_exercise_sets
-- ("<table>: create|delete", 0046) are what authorize it. No new tables;
-- the existing session_segments / template_segments policies cover the
-- new column (read: any signed-in user; write: owner only).
-- Also recreates gym_tv_board (0062) to include the text.
-- Run AFTER 0064.
-- ============================================================================

alter table session_segments add column text_content text;
alter table template_segments add column text_content text;

comment on column session_segments.text_content is
  'Set = a text-only part: no exercises, members see this text as written (accessories, an AMRAP). Null = an exercise part.';
comment on column template_segments.text_content is
  'Copied to session_segments.text_content when the template is assigned.';

-- ----------------------------------------------------------------------------
-- copy_session_workout: replaces p_target's workout with a copy of
-- p_source's. Callers decide which targets are safe (not logged).
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
    insert into session_segments (session_id, type, label, default_rounds, is_scored, text_content, sort_order)
    values (p_target, v_segment.type, v_segment.label, v_segment.default_rounds, v_segment.is_scored,
            v_segment.text_content, v_segment.sort_order)
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

comment on function copy_session_workout(uuid, uuid) is
  'Replaces one class''s workout with a copy of another''s. Used by the programme calendar copy functions. Owner only (RLS, security invoker).';

revoke execute on function copy_session_workout(uuid, uuid) from public, anon;
grant execute on function copy_session_workout(uuid, uuid) to authenticated;

-- True if any member has logged a set against this class's workout.
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
  );
$$;

revoke execute on function session_has_logs(uuid) from public, anon;
grant execute on function session_has_logs(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- copy_week_workouts (0063), now via copy_session_workout.
-- ----------------------------------------------------------------------------
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

      if exists (select 1 from session_segments where session_id = v_target_id)
         and (not p_replace or session_has_logs(v_target_id)) then
        v_kept := v_kept + 1;
        continue;
      end if;

      perform copy_session_workout(v_source.id, v_target_id);
      v_copied := v_copied + 1;
    end loop;
  end loop;

  return query select v_copied, v_kept, v_no_class;
end;
$$;

-- ----------------------------------------------------------------------------
-- copy_workout_forward (0064), now via copy_session_workout.
-- ----------------------------------------------------------------------------
create or replace function copy_workout_forward(p_source_session uuid)
returns table (copied integer, kept integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source record;
  v_target_id uuid;
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
    if session_has_logs(v_target_id) then
      v_kept := v_kept + 1;
      continue;
    end if;

    perform copy_session_workout(v_source.id, v_target_id);
    v_copied := v_copied + 1;
  end loop;

  return query select v_copied, v_kept;
end;
$$;

-- ----------------------------------------------------------------------------
-- copy_workout_same_day: one class's workout onto every other scheduled
-- class of the same type that date. Returns the classes it copied to, so
-- the app can run "and every later" from each of them too.
-- ----------------------------------------------------------------------------
create or replace function copy_workout_same_day(p_source_session uuid)
returns table (copied integer, kept integer, copied_ids uuid[])
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source record;
  v_target_id uuid;
  v_kept integer := 0;
  v_ids uuid[] := '{}';
begin
  if not is_owner() then
    raise exception 'Only the owner can copy workouts' using errcode = '42501';
  end if;

  select s.id, s.template_id, s.session_date into v_source
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
      and t.session_date = v_source.session_date
      and t.id <> v_source.id
    order by t.start_time
  loop
    if session_has_logs(v_target_id) then
      v_kept := v_kept + 1;
      continue;
    end if;

    perform copy_session_workout(v_source.id, v_target_id);
    v_ids := v_ids || v_target_id;
  end loop;

  return query select cardinality(v_ids), v_kept, v_ids;
end;
$$;

comment on function copy_workout_same_day(uuid) is
  'Workout builder "every GCP class this Monday": one class''s workout onto every other class of the same type that date. Owner only (RLS, security invoker). Never replaces a workout members have logged.';

revoke execute on function copy_workout_same_day(uuid) from public, anon;
grant execute on function copy_workout_same_day(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- gym_tv_board (0062), now with text_content so a text part shows on the TV.
-- Otherwise unchanged; grants carry over with create or replace.
-- ----------------------------------------------------------------------------
create or replace function gym_tv_board(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_token is null or not exists (select 1 from gym_tv_link where token = p_token) then
    return null;
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'class_name', t.name,
        'start_time', s.start_time,
        'duration_minutes', s.duration_minutes,
        'coach_first_name', split_part(trim(p.full_name), ' ', 1),
        'segments', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'type', g.type,
              'label', g.label,
              'is_scored', g.is_scored,
              'text_content', g.text_content,
              'exercises', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'name', x.name,
                    'each_side', x.each_side,
                    'tempo', x.tempo,
                    'sets', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'target', st.target,
                          'rest_seconds', st.rest_seconds,
                          'intensity_type', st.intensity_type,
                          'intensity_value', st.intensity_value
                        ) order by st.sort_order
                      )
                      from session_exercise_sets st
                      where st.exercise_id = x.id
                    ), '[]'::jsonb)
                  ) order by x.sort_order
                )
                from session_exercises x
                where x.segment_id = g.id
              ), '[]'::jsonb)
            ) order by g.sort_order
          )
          from session_segments g
          where g.session_id = s.id
        ), '[]'::jsonb)
      ) order by s.start_time
    )
    from sessions s
    join session_templates t on t.id = s.template_id
    left join profiles p on p.id = s.coach_id
    where s.session_date = (now() at time zone 'Europe/London')::date
      and s.status <> 'cancelled'
  ), '[]'::jsonb);
end;
$$;

comment on function gym_tv_board(text) is
  'Gym TV page: today''s classes and workouts for a valid TV token, else null. No member data, no coach notes.';

