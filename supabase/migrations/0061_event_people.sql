-- ============================================================================
-- 0061_event_people.sql
-- Events show who posted a member event and who's going (member feedback
-- via Carl, 2026-10-13: "see their mate on it and join"). First names only
-- — confirmed by Carl, 2026-10-13.
--
-- Members can't read each other's profiles ("profiles: read", 0046), and
-- that stays so. Same pattern as list_coach_names (0011): a narrow
-- security-definer function that only ever returns a first name, and only
-- for people attached to an event — posted it, or tapped "I'm in". events
-- and event_interests are already readable by every signed-in user, so the
-- only new thing exposed is that first name.
--
-- No new tables; no RLS changes. Run AFTER 0060.
-- ============================================================================

create or replace function event_people(p_event_ids uuid[])
returns table (event_id uuid, person_id uuid, first_name text, is_creator boolean)
language sql
stable
security definer
set search_path = public
as $$
  -- Gym events are the gym's, not a person's: no creator row for them.
  select e.id, p.id, split_part(trim(p.full_name), ' ', 1), true
  from events e
  join profiles p on p.id = e.created_by
  where e.id = any (p_event_ids) and e.event_type = 'member_posted'
  union all
  select i.event_id, p.id, split_part(trim(p.full_name), ' ', 1), false
  from event_interests i
  join profiles p on p.id = i.member_id
  where i.event_id = any (p_event_ids);
$$;

comment on function event_people(uuid[]) is
  'First names of who posted (member events) and who is going, for the member Events list. Names only — profiles stay unreadable between members.';

revoke execute on function event_people(uuid[]) from public, anon;
grant execute on function event_people(uuid[]) to authenticated;
