-- ============================================================================
-- 0007_credit_deduction.sql
-- Wires up the credit-pack deduction deferred in 0005/0006 — now that
-- the owner can assign member_memberships (see the owner/members
-- feature), there's actually membership data to check against.
--
-- Booking now requires an active membership at all (previously any
-- signed-in member could book regardless). For credit-pack plans
-- (drop_in, pack_5), booking deducts 1 credit and cancelling refunds
-- it. Weekly-limit enforcement for sessions_per_week plans (2x_week,
-- 1x_week, 6wk_2x) is NOT implemented here — still an open gap,
-- deliberately out of scope for this pass.
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
  v_existing_id uuid;
  v_credit_pack_size integer;
  v_credit_balance integer;
  v_ledger_id uuid;
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

  select mp.credit_pack_size into v_credit_pack_size
  from member_memberships mm
  join membership_plans mp on mp.id = mm.plan_id
  where mm.member_id = v_member_id and mm.status = 'active'
  order by mm.started_at desc
  limit 1
  for update of mm;

  if not found then
    raise exception 'No active membership — see the owner to get set up.';
  end if;

  if v_credit_pack_size is not null then
    select coalesce(sum(delta), 0) into v_credit_balance
    from credit_ledger where member_id = v_member_id;

    if v_credit_balance < 1 then
      raise exception 'No credits remaining on your pack.';
    end if;
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

  if v_credit_pack_size is not null then
    insert into credit_ledger (member_id, delta, reason, related_booking_id, created_by)
    values (v_member_id, -1, 'booking', v_booking.id, v_member_id)
    returning id into v_ledger_id;

    update bookings set credit_ledger_id = v_ledger_id where id = v_booking.id;
    v_booking.credit_ledger_id := v_ledger_id;
  end if;

  return v_booking;
end;
$$;

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

  if v_booking.credit_ledger_id is not null then
    insert into credit_ledger (member_id, delta, reason, related_booking_id, created_by)
    values (v_member_id, 1, 'cancellation_refund', p_booking_id, v_member_id);
  end if;

  update bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;
