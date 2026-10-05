-- ============================================================================
-- 0055_waitlist_needs_membership.sql
-- join_waitlist() (0050) checked nothing about the member's plan, so
-- someone with no membership — or whose plan doesn't cover the class, whose
-- programme has ended, or whose pack is empty — could join a waitlist, be
-- offered the place, fail to book it, and hold it for the 2-hour offer
-- while paying members behind them waited. Members pay first and then get
-- access (Carl, 2026-10-05), so waiting now needs the same eligibility as
-- booking: an active membership that covers this class on this date, and
-- a credit if it's a pack. Found by supabase/manual/booking-credit-tests.sql.
--
-- Same function as 0050 otherwise. Grants unchanged (0010: authenticated
-- only — create or replace keeps them). No table or RLS changes:
-- join_waitlist is security definer and only ever acts as auth.uid().
-- ============================================================================

create or replace function join_waitlist(p_session_id uuid, p_buddy_member_id uuid default null)
returns waitlist_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_session sessions%rowtype;
  v_taken integer;
  v_reserved integer;
  v_position integer;
  v_entry waitlist_entries%rowtype;
  v_credit_pack_size integer;
  v_started_at timestamptz;
  v_programme_length_days integer;
  v_programme_last_day date;
  v_allowed_template_codes text[];
  v_template_code text;
begin
  if v_member_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_buddy_member_id = v_member_id then
    raise exception 'You can''t buddy yourself';
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

  -- New in 0055: only someone who could actually book this class can wait
  -- for it — otherwise they'd be offered a place they can't take and hold
  -- it for 2 hours while paying members wait. Same rules and messages as
  -- book_session (0050). Credits are checked too (a pack with none left);
  -- the weekly limit isn't, since they may cancel another class first.
  select mp.credit_pack_size, mm.started_at, mp.programme_length_days, mp.allowed_template_codes
  into v_credit_pack_size, v_started_at, v_programme_length_days, v_allowed_template_codes
  from member_memberships mm
  join membership_plans mp on mp.id = mm.plan_id
  where mm.member_id = v_member_id and mm.status = 'active'
  order by mm.started_at desc
  limit 1;

  if not found then
    raise exception 'No active membership — see the owner to get set up.';
  end if;

  if v_allowed_template_codes is not null then
    select code into v_template_code from session_templates where id = v_session.template_id;
    if v_template_code is null or not (v_template_code = any (v_allowed_template_codes)) then
      raise exception 'Your plan only covers % classes.',
        (select string_agg(name, ', ' order by name) from session_templates where code = any (v_allowed_template_codes));
    end if;
  end if;

  if v_programme_length_days is not null then
    v_programme_last_day := (v_started_at at time zone 'Europe/London')::date + v_programme_length_days - 1;
    if v_session.session_date > v_programme_last_day then
      raise exception 'Your programme finishes on % — see the owner to carry on training with us.',
        to_char(v_programme_last_day, 'FMDay FMDD FMMonth');
    end if;
  end if;

  if v_credit_pack_size is not null
     and (select coalesce(sum(delta), 0) from credit_ledger where member_id = v_member_id) < 1 then
    raise exception 'No credits remaining on your pack.';
  end if;

  if p_buddy_member_id is not null and not exists (
    select 1 from profiles where id = p_buddy_member_id and role = 'member'
  ) then
    raise exception 'Buddy not found';
  end if;

  select count(*) into v_taken from bookings
    where session_id = p_session_id and status = 'booked';
  -- New in 0050: guests (refer a friend) hold a place too.
  select count(*) + guest_spots_held(p_session_id) into v_reserved from waitlist_entries
    where session_id = p_session_id and status = 'offered';

  if v_taken + v_reserved < v_session.capacity then
    raise exception 'This session has space — book it directly instead of joining the waitlist.';
  end if;

  select coalesce(max(position), 0) + 1 into v_position
    from waitlist_entries where session_id = p_session_id;

  insert into waitlist_entries (session_id, member_id, buddy_member_id, position, status)
  values (p_session_id, v_member_id, p_buddy_member_id, v_position, 'waiting')
  on conflict (session_id, member_id)
  do update set
    buddy_member_id = excluded.buddy_member_id,
    position = excluded.position,
    status = 'waiting',
    offered_at = null,
    offer_expires_at = null
  returning * into v_entry;

  return v_entry;
end;
$$;
