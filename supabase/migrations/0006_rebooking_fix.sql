-- ============================================================================
-- 0006_rebooking_fix.sql
-- Fixes: cancelling a booking then re-booking the same session hit the
-- unconditional unique(session_id, member_id) constraint from 0001,
-- because the old cancelled row was still there. A member should be able
-- to cancel and rebook the same session any number of times.
-- ============================================================================

alter table bookings drop constraint bookings_session_id_member_id_key;

create unique index bookings_active_session_member_key
  on bookings (session_id, member_id)
  where status = 'booked';

-- book_session now reactivates an existing (e.g. previously cancelled) row
-- for this member+session instead of always inserting a fresh one.
create or replace function book_session(p_session_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_session sessions%rowtype;
  v_taken integer;
  v_booking bookings%rowtype;
  v_existing_id uuid;
begin
  if v_member_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found then
    raise exception 'Session not found';
  end if;

  if v_session.status <> 'scheduled' then
    raise exception 'This session is not open for booking';
  end if;

  if exists (
    select 1 from bookings
    where session_id = p_session_id and member_id = v_member_id and status = 'booked'
  ) then
    raise exception 'You already have a booking for this session';
  end if;

  select count(*) into v_taken from bookings
  where session_id = p_session_id and status = 'booked';

  if v_taken >= v_session.capacity then
    raise exception 'Session is full';
  end if;

  select id into v_existing_id from bookings
  where session_id = p_session_id and member_id = v_member_id;

  if v_existing_id is not null then
    update bookings
    set status = 'booked', booked_at = now(), cancelled_at = null, credit_ledger_id = null
    where id = v_existing_id
    returning * into v_booking;
  else
    insert into bookings (session_id, member_id, status)
    values (p_session_id, v_member_id, 'booked')
    returning * into v_booking;
  end if;

  return v_booking;
end;
$$;
