-- ============================================================================
-- 0054_restore_cancellation_window.sql
-- 0012's 3-hour cancellation rule wasn't live: the booking tests
-- (supabase/manual/booking-credit-tests.sql, 2026-10-05) showed the
-- production cancel_booking() had no time check, so a member cancelling
-- 2 hours before class got their credit back. Either 0012 never ran or a
-- later hand-run of an older version overwrote it.
--
-- This re-applies 0012's function exactly (same body, so
-- supabase/manual/function-audit.sql sees it as matching): cancelling
-- within 3 hours of the start (Europe/London) forfeits the credit;
-- earlier than that refunds it. Grants are unchanged (0005: authenticated
-- only — create or replace keeps them).
--
-- Governing RLS: none needed — cancel_booking is security definer and
-- checks the caller owns the booking; credit_ledger has no insert policy
-- for anyone but the service role / definer functions (0001).
-- ============================================================================

create or replace function cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_booking bookings%rowtype;
  v_session sessions%rowtype;
  v_session_start timestamptz;
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

  select * into v_session from sessions where id = v_booking.session_id;

  v_session_start := (v_session.session_date + v_session.start_time) at time zone 'Europe/London';

  if v_booking.credit_ledger_id is not null and now() < v_session_start - interval '3 hours' then
    insert into credit_ledger (member_id, delta, reason, related_booking_id, created_by)
    values (v_member_id, 1, 'cancellation_refund', p_booking_id, v_member_id);
  end if;

  update bookings
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id
  returning * into v_booking;

  perform promote_waitlist(v_booking.session_id);

  return v_booking;
end;
$$;
