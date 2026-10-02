-- ============================================================================
-- 0040_stripe_checkout.sql
-- Stripe payment -> app access (decided 2026-10-01). Guy sells through
-- Stripe payment links; the webhook (src/app/api/webhooks/stripe) matches
-- the bought product's NAME to a plan via membership_plans
-- .stripe_product_name, then creates the account and assigns the plan.
--
--  1. membership_plans.stripe_product_name — exact Stripe product name.
--  2. membership_plans.allowed_template_codes — null = every class; set
--     for plans limited to certain classes (GCP - Hyrox only).
--  3. Three plans from Guy's Stripe catalogue that didn't exist yet. Their
--     price_pence starts at 0 and the webhook fills it from Stripe's price
--     on the first sale — Stripe holds the prices, nobody re-types them.
--  4. member_memberships.stripe_checkout_session_id (unique) — makes the
--     webhook idempotent when Stripe retries the same event.
--  5. book_session() and accept_booking_invite() enforce (2). Bodies
--     copied forward from 0031 and 0014. accept_booking_invite() also
--     gains the weekly limit (0023) and programme end date (0030) checks
--     it never had, so buddy invites can't bypass them.
--
-- No new tables, so no new RLS: the existing plan/membership policies
-- (0002) cover the new columns, and only the webhook (service role)
-- writes them. Run AFTER 0039.
-- ============================================================================

alter table membership_plans
  add column stripe_product_name text unique,
  add column allowed_template_codes text[];

comment on column membership_plans.stripe_product_name is
  'Exact product name in Guy''s Stripe account. The Stripe webhook matches purchases to plans on this.';
comment on column membership_plans.allowed_template_codes is
  'session_templates.code values this plan can book. Null = all classes.';

alter table member_memberships
  add column stripe_checkout_session_id text unique,
  add column stripe_customer_id text;

insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days, allowed_template_codes) values
  ('hyrox_only',     'Hyrox only',                  0, 'recurring', null, null, null, '{hyrox}'),
  ('starter_21d',    '21-Day Starter Programme',    0, 'one_off',   null, null, 21,   null),
  ('6wk_1x',         '6-Week Programme (1x/week)',  0, 'one_off',   1,    null, 42,   null)
on conflict (code) do nothing;

update membership_plans set stripe_product_name = v.product
from (values
  ('1x_week',       'GCP - 1 per week'),
  ('2x_week',       'GCP - 2 per week'),
  ('unlimited',     'GCP - UNLIMITED'),
  ('hyrox_only',    'GCP - Hyrox only'),
  ('starter_21d',   '21 day starter program'),
  ('6wk_1x',        '6WP - 1 per week'),
  ('6wk_2x',        '6WP - 2 per week'),
  ('6wk_unlimited', '6WP - Unlimited')
) as v(code, product)
where membership_plans.code = v.code;

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

  -- New in 0031: members can book at most 14 days ahead, in UK dates
  -- (BOOKING_WINDOW_DAYS in src/lib/booking-window.ts — the Schedule tab
  -- only lists that far ahead, so change both together).
  if v_session.session_date > (now() at time zone 'Europe/London')::date + 14 then
    raise exception 'You can book up to two weeks ahead — this one opens on %.',
      to_char(v_session.session_date - 14, 'FMDay FMDD FMMonth');
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

create or replace function accept_booking_invite(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_booking bookings%rowtype;
  v_credit_pack_size integer;
  v_credit_balance integer;
  v_ledger_id uuid;
  v_allowed_template_codes text[];
  v_template_code text;
  v_session_date date;
  v_sessions_per_week integer;
  v_started_at timestamptz;
  v_programme_length_days integer;
  v_programme_last_day date;
  v_week_start date;
  v_week_end date;
  v_week_booked_count integer;
begin
  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'Invite not found';
  end if;

  if v_booking.member_id <> v_member_id then
    raise exception 'Not your invite';
  end if;

  if v_booking.status <> 'invited' or v_booking.invite_expires_at < now() then
    raise exception 'This invite is no longer available';
  end if;

  select mp.credit_pack_size, mp.allowed_template_codes, mp.sessions_per_week,
         mm.started_at, mp.programme_length_days
  into v_credit_pack_size, v_allowed_template_codes, v_sessions_per_week,
       v_started_at, v_programme_length_days
  from member_memberships mm
  join membership_plans mp on mp.id = mm.plan_id
  where mm.member_id = v_member_id and mm.status = 'active'
  order by mm.started_at desc
  limit 1
  for update of mm;

  if not found then
    raise exception 'No active membership — see the owner to get set up.';
  end if;

  select s.session_date, st.code into v_session_date, v_template_code
  from sessions s join session_templates st on st.id = s.template_id
  where s.id = v_booking.session_id;

  -- New in 0040: accepting an invite skipped the plan checks book_session
  -- makes, so a 1x/week member could go over their limit (or a 6-week
  -- member book past their programme) via buddy invites. Same three
  -- checks as book_session, in the same order.

  -- Class restriction (GCP - Hyrox only).
  if v_allowed_template_codes is not null then
    if v_template_code is null or not (v_template_code = any (v_allowed_template_codes)) then
      raise exception 'Your plan only covers % classes.',
        (select string_agg(name, ', ' order by name) from session_templates where code = any (v_allowed_template_codes));
    end if;
  end if;

  -- Programme end date (from 0030).
  if v_programme_length_days is not null then
    v_programme_last_day := (v_started_at at time zone 'Europe/London')::date + v_programme_length_days - 1;
    if v_session_date > v_programme_last_day then
      raise exception 'Your programme finishes on % — see the owner to carry on training with us.',
        to_char(v_programme_last_day, 'FMDay FMDD FMMonth');
    end if;
  end if;

  -- Weekly limit (from 0023), for the Mon-Sun week of the session. This
  -- invite is still 'invited', so it isn't in the count.
  if v_sessions_per_week is not null then
    v_week_start := v_session_date - (extract(isodow from v_session_date)::int - 1);
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

  if v_credit_pack_size is not null then
    select coalesce(sum(delta), 0) into v_credit_balance
    from credit_ledger where member_id = v_member_id;

    if v_credit_balance < 1 then
      raise exception 'No credits remaining on your pack.';
    end if;
  end if;

  update bookings
  set status = 'booked', invite_expires_at = null, booked_at = now()
  where id = p_booking_id
  returning * into v_booking;

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

revoke execute on function accept_booking_invite(uuid) from public, anon;
grant execute on function accept_booking_invite(uuid) to authenticated;
