-- ============================================================================
-- 0012_cancellation_window.sql
-- Enforces the confirmed cancellation policy: cancelling within 3 hours of
-- a session's start forfeits the credit (no refund, no extra fee);
-- cancelling outside that window refunds as before. cancel_booking()
-- previously always refunded with no time check at all — a real bug
-- against the confirmed policy, tracked in ROADMAP.md.
--
-- session_date/start_time have no tz column and always mean Europe/London
-- wall-clock time (single-site UK gym — same assumption src/lib/format.ts
-- makes on the display side). Interpret via `at time zone 'Europe/London'`
-- so BST/GMT transitions are handled correctly instead of assuming a fixed
-- UTC offset.
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
