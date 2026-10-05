-- ============================================================================
-- 0056_excuse_booking.sql
-- "Excused" now gives the credit back (Carl/Guy walkthrough, 2026-10-05).
-- Until now Excused was only a label: a member who cancelled late (inside
-- the 3-hour window, 0012/0054) or missed a class, but had messaged their
-- coach, still lost the credit. Carl confirmed: the coach taking the
-- session can excuse it on their own session, and the credit comes back.
--
-- excuse_booking(booking_id):
--   - who: the owner, or the coach taking that session with Today switched
--     on (same test as "bookings: change", 0046) — checked inside, since
--     it writes the credit ledger, which only definer functions may do.
--   - what: a booking that is booked, late-cancelled (cancelled) or marked
--     no-show becomes 'excused'.
--   - credit: if a credit was spent on this booking (credit_ledger_id set)
--     and hasn't already been refunded since it was spent, +1 back, reason
--     'excused_refund', created_by = who excused it (so Guy can see who
--     refunded what). A booking cancelled more than 3 hours ahead was
--     already refunded by cancel_booking, so it isn't refunded twice.
--
-- No table or RLS changes: credit_ledger stays insert-only for definer
-- functions / service role (0001); the bookings update policy is
-- unchanged (attendance marking still uses it for attended / no-show).
-- ============================================================================

create or replace function excuse_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_booking bookings%rowtype;
  v_session sessions%rowtype;
  v_charged_at timestamptz;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_session from sessions where id = v_booking.session_id;

  if not (is_owner() or (staff_can_view('today') and v_session.coach_id = v_caller)) then
    raise exception 'Only the coach taking this session, or Guy, can excuse it';
  end if;

  if v_booking.status not in ('booked', 'cancelled', 'no_show') then
    raise exception 'This booking can''t be excused (it''s %)', v_booking.status;
  end if;

  if v_booking.credit_ledger_id is not null then
    select created_at into v_charged_at from credit_ledger where id = v_booking.credit_ledger_id;

    if not exists (
      select 1 from credit_ledger
      where related_booking_id = p_booking_id
        and reason in ('cancellation_refund', 'excused_refund')
        and delta > 0
        and created_at >= v_charged_at
    ) then
      insert into credit_ledger (member_id, delta, reason, related_booking_id, created_by)
      values (v_booking.member_id, 1, 'excused_refund', p_booking_id, v_caller);
    end if;
  end if;

  update bookings
  set status = 'excused'
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function excuse_booking(uuid) from public, anon;
grant execute on function excuse_booking(uuid) to authenticated;
