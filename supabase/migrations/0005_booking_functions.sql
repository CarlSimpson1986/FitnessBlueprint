-- ============================================================================
-- 0005_booking_functions.sql
-- Booking, cancellation, and availability as security-definer RPCs.
--
-- Why RPCs and not plain client inserts: booking needs an atomic
-- capacity check (count existing bookings, compare to session.capacity,
-- insert — all in one statement) to avoid a race where two members both
-- pass the check at once and overbook a session. A function does this in
-- a single transaction; separate client-side select-then-insert calls
-- cannot.
--
-- Credit deduction is deliberately NOT implemented here. It depends on
-- member_memberships rows that don't exist yet (no checkout flow built).
-- When that ships, book_session needs to check the member's active plan
-- and, for credit-pack plans, insert a matching credit_ledger row —
-- see the 'booking' / 'cancellation_refund' reasons already reserved
-- for this in 0001.
-- ============================================================================

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

  insert into bookings (session_id, member_id, status)
  values (p_session_id, v_member_id, 'booked')
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function book_session from public, anon;
grant execute on function book_session to authenticated;

create or replace function cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_booking bookings%rowtype;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.member_id <> v_member_id then
    raise exception 'Not your booking';
  end if;

  if v_booking.status <> 'booked' then
    raise exception 'Booking is not active';
  end if;

  update bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function cancel_booking from public, anon;
grant execute on function cancel_booking to authenticated;

-- Aggregate-only: returns counts, never member identities, so it's safe
-- for any authenticated member to call even though the underlying
-- `bookings` table only grants them read access to their own rows.
create or replace function session_spots_taken(p_session_ids uuid[])
returns table (session_id uuid, spots_taken bigint)
language sql
stable
security definer
set search_path = public
as $$
  select bookings.session_id, count(*) as spots_taken
  from bookings
  where bookings.session_id = any(p_session_ids) and status = 'booked'
  group by bookings.session_id;
$$;

revoke execute on function session_spots_taken from public, anon;
grant execute on function session_spots_taken to authenticated;
