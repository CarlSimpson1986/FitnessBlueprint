-- ============================================================================
-- 0059_weekly_allowance_counts_late_cancels.sql
-- The spec's cancellation rule (Guy: "3 hours — no additional fee, they
-- just lose the booking credit") only applied to drop-ins. On weekly plans
-- and the 6-week programmes, book_session's weekly count looked only at
-- bookings still 'booked', so:
--   - cancelling late (even 10 minutes before) freed that week's place;
--   - once a coach marked a class attended or no-show it stopped counting,
--     so a 2x-a-week member who'd attended Monday could book two more.
-- Now the week counts booked, attended and no-show classes, plus ones
-- cancelled inside 3 hours of the start (same window as cancel_booking,
-- 0012/0054). Excusing a booking (0056) gives the place back. Cancelling
-- more than 3 hours ahead still frees the place.
--
-- Also: the booking window is now 7 days, not 14 (Carl, 2026-10-05) — on a
-- Tuesday you can book up to next Tuesday's class. BOOKING_WINDOW_DAYS in
-- src/lib/booking-window.ts must match.
--
-- Same function as 0050 otherwise. Grants unchanged. No table or RLS
-- changes: book_session is security definer and acts only as auth.uid().
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
  v_started_at timestamptz;
  v_programme_length_days integer;
  v_programme_last_day date;
  v_allowed_template_codes text[];
  v_template_code text;
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

  select mp.credit_pack_size, mp.sessions_per_week, mm.started_at, mp.programme_length_days,
         mp.allowed_template_codes
  into v_credit_pack_size, v_sessions_per_week, v_started_at, v_programme_length_days,
       v_allowed_template_codes
  from member_memberships mm
  join membership_plans mp on mp.id = mm.plan_id
  where mm.member_id = v_member_id and mm.status = 'active'
  order by mm.started_at desc
  limit 1
  for update of mm;

  if not found then
    raise exception 'No active membership — see the owner to get set up.';
  end if;

  -- New in 0040: a plan limited to certain classes (GCP - Hyrox only)
  -- can only book those.
  if v_allowed_template_codes is not null then
    select code into v_template_code from session_templates where id = v_session.template_id;
    if v_template_code is null or not (v_template_code = any (v_allowed_template_codes)) then
      raise exception 'Your plan only covers % classes.',
        (select string_agg(name, ', ' order by name) from session_templates where code = any (v_allowed_template_codes));
    end if;
  end if;

  -- Members can book at most 7 days ahead, in UK dates: on a Tuesday, up
  -- to next Tuesday (0059; was 14 days since 0031)
  -- (BOOKING_WINDOW_DAYS in src/lib/booking-window.ts — the Schedule tab
  -- only lists that far ahead, so change both together).
  if v_session.session_date > (now() at time zone 'Europe/London')::date + 7 then
    raise exception 'You can book up to a week ahead — this one opens on %.',
      to_char(v_session.session_date - 7, 'FMDay FMDD FMMonth');
  end if;

  -- From 0030: a fixed-length programme (the 6-week programmes, 42
  -- days) only covers sessions up to its last day, counted in UK dates
  -- from the day it started. Checked against the session's date, not
  -- today's, so a member on day 40 can't book a class for day 45.
  if v_programme_length_days is not null then
    v_programme_last_day := (v_started_at at time zone 'Europe/London')::date + v_programme_length_days - 1;
    if v_session.session_date > v_programme_last_day then
      raise exception 'Your programme finishes on % — see the owner to carry on training with us.',
        to_char(v_programme_last_day, 'FMDay FMDD FMMonth');
    end if;
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

    -- New in 0059: a class counts towards the week once it's booked, and
    -- keeps counting after the coach marks it attended or no-show, or if
    -- the member cancels inside 3 hours of the start. An excused booking
    -- (0056) gives the place back. Before, only 'booked' counted, so
    -- marking attendance or cancelling late freed the place again.
    select count(*) into v_week_booked_count
    from bookings b
    join sessions s on s.id = b.session_id
    where b.member_id = v_member_id
      and s.session_date between v_week_start and v_week_end
      and (
        b.status in ('booked', 'attended', 'no_show')
        or (
          b.status = 'cancelled'
          and b.cancelled_at >= ((s.session_date + s.start_time) at time zone 'Europe/London') - interval '3 hours'
        )
      );

    if v_week_booked_count >= v_sessions_per_week then
      raise exception 'Your plan allows % session(s) a week, and you''ve already used % that week (late cancellations count).',
        v_sessions_per_week, v_week_booked_count;
    end if;
  end if;

  -- Excludes the caller's own row so converting your own pending invite
  -- into a real booking below doesn't double-count it against capacity.
  select count(*) into v_taken from bookings
  where session_id = p_session_id
    and member_id <> v_member_id
    and (status = 'booked' or (status = 'invited' and invite_expires_at > now()));

  -- New in 0050: guests (refer a friend) hold a place too.
  select count(*) + guest_spots_held(p_session_id) into v_reserved from waitlist_entries
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
