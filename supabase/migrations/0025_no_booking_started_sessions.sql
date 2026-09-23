-- ============================================================================
-- 0025_no_booking_started_sessions.sql
-- book_session() never checked the clock: a member could book a class
-- that had already started (or happened earlier today), because the
-- schedule lists every scheduled session from today onward. Full function
-- body copied forward from 0023 (never edit a past migration in place)
-- with one addition: reject once session_date + start_time (UK time) has
-- passed. The Schedule tab also hides started classes, but this is the
-- check that actually holds.
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
  v_reserved integer;
  v_booking bookings%rowtype;
  v_existing_id uuid;
  v_credit_pack_size integer;
  v_credit_balance integer;
  v_ledger_id uuid;
  v_sessions_per_week integer;
  v_week_start date;
  v_week_end date;
  v_week_booked_count integer;
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

  -- New in 0025: a class that has already started can't be booked.
  -- start_time is UK local time, so compare against UK local "now".
  if (v_session.session_date + v_session.start_time) <= (now() at time zone 'Europe/London') then
    raise exception 'This session has already started';
  end if;

  if exists (
    select 1 from bookings
    where session_id = p_session_id and member_id = v_member_id and status = 'booked'
  ) then
    raise exception 'You already have a booking for this session';
  end if;

  select mp.credit_pack_size, mp.sessions_per_week into v_credit_pack_size, v_sessions_per_week
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

  -- Mon-Sun week containing the session being booked (isodow: 1=Mon..7=Sun),
  -- not "this week from today" — a member booking three weeks ahead should
  -- be checked against THAT week's usage, not this one.
  if v_sessions_per_week is not null then
    v_week_start := v_session.session_date - (extract(isodow from v_session.session_date)::int - 1);
    v_week_end := v_week_start + 6;

    select count(*) into v_week_booked_count
    from bookings b
    join sessions s on s.id = b.session_id
    where b.member_id = v_member_id
      and b.status = 'booked'
      and s.session_date between v_week_start and v_week_end;

    if v_week_booked_count >= v_sessions_per_week then
      raise exception 'Your plan allows % session(s) a week, and you''ve already got % booked that week.',
        v_sessions_per_week, v_week_booked_count;
    end if;
  end if;

  -- Excludes the caller's own row so converting your own pending invite
  -- into a real booking below doesn't double-count it against capacity.
  select count(*) into v_taken from bookings
  where session_id = p_session_id
    and member_id <> v_member_id
    and (status = 'booked' or (status = 'invited' and invite_expires_at > now()));

  select count(*) into v_reserved from waitlist_entries
  where session_id = p_session_id and status = 'offered';

  if v_taken + v_reserved >= v_session.capacity then
    raise exception 'Session is full';
  end if;

  select id into v_existing_id from bookings
  where session_id = p_session_id and member_id = v_member_id;

  if v_existing_id is not null then
    update bookings
    set status = 'booked', booked_at = now(), cancelled_at = null, credit_ledger_id = null,
        invited_by = null, invite_expires_at = null
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
