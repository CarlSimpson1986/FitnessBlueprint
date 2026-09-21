-- ============================================================================
-- 0018_mark_self_attended.sql
-- Lets a member self-report attendance when they finish a live-logged
-- workout (the new "Start session -> log -> Finish" flow has no coach in
-- the loop, unlike today's roster-only attendance marking). Scoped to the
-- caller's own booking, only flips booked -> attended, and only once the
-- session has actually started — same trust-by-honor-system as the rest of
-- this app (no turnstile/scan-in exists). Coaches keep roster override in
-- src/app/admin/sessions/SessionRoster.tsx for real discrepancies.
--
-- session_date/start_time have no tz column and always mean Europe/London
-- wall-clock time — same `at time zone` handling as 0012_cancellation_window.sql.
-- ============================================================================

create or replace function mark_self_attended(p_session_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_session sessions%rowtype;
  v_session_start timestamptz;
  v_booking bookings%rowtype;
begin
  if v_member_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_session from sessions where id = p_session_id;
  if not found then
    raise exception 'Session not found';
  end if;

  v_session_start := (v_session.session_date + v_session.start_time) at time zone 'Europe/London';
  if now() < v_session_start then
    raise exception 'Session has not started yet';
  end if;

  select * into v_booking from bookings
  where session_id = p_session_id and member_id = v_member_id and status = 'booked'
  for update;

  if not found then
    raise exception 'No active booking for this session';
  end if;

  update bookings
  set status = 'attended'
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function mark_self_attended from public, anon;
grant execute on function mark_self_attended to authenticated;
