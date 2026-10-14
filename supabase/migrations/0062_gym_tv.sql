-- ============================================================================
-- 0062_gym_tv.sql
-- Gym TV: one link left open on the gym's TV, showing today's class workout
-- in landscape (Carl, 2026-10-14). The page moves itself on to the next
-- class 5 minutes before it starts (classes run back to back) and checks
-- for changes every minute; coaches just reload it if it looks stuck.
--
-- The TV can't sign in, so the link carries a long random token — same idea
-- as the calendar feeds (0034) and guest invites (0050). One gym-wide link;
-- Guy can reset it from Account settings, which kills the old one.
--
-- gym_tv_board() is the only way in without an account: it checks the token
-- and returns today's classes and their workouts — class, time, coach first
-- name, and the exercises. No members, no bookings, no coach notes (members
-- never see those either). Run AFTER 0061.
-- ============================================================================

create table gym_tv_link (
  id boolean primary key default true check (id), -- one row only
  token text not null unique,
  created_at timestamptz not null default now()
);

comment on table gym_tv_link is
  'The secret token behind the gym TV page (/tv/<token>). One row; "Reset link" replaces the token.';

alter table gym_tv_link enable row level security;

-- Owner only, for every action — coaches don't need the link, it lives on
-- the TV.
create policy "gym_tv_link: read"
  on gym_tv_link for select
  to authenticated
  using (
    is_owner()
  );
create policy "gym_tv_link: create"
  on gym_tv_link for insert
  to authenticated
  with check (
    is_owner()
  );
create policy "gym_tv_link: change"
  on gym_tv_link for update
  to authenticated
  using (
    is_owner()
  )
  with check (
    is_owner()
  );

-- ----------------------------------------------------------------------------
-- gym_tv_board — today's (UK date) classes with their workouts, as JSON,
-- or null for a wrong token.
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

revoke execute on function gym_tv_board(text) from public;
grant execute on function gym_tv_board(text) to anon, authenticated;
