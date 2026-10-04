-- ============================================================================
-- 0050_guest_invites.sql
-- Refer a friend (spec doc: Guy's notes + Carl's Q6; Carl 2026-10-04):
--   - A member booked into a class can invite a friend from OUTSIDE the
--     gym, free, by name + email. The friend gets an email link and
--     confirms with a short health form — no account.
--   - 1 guest pass per member per calendar month (UK). If a guest they
--     invited becomes a member, they get another pass that month.
--   - A guest takes a place in the class. Full class = no invite; the app
--     tells the member to message the gym instead.
--   - An unconfirmed invite holds the place until 3 hours before the
--     class (the cancellation window), then lapses and frees it.
--   - Member-to-member buddy invites are retired (guests only):
--     invite_buddy can no longer be called. Any pending ones can still be
--     accepted or declined until they expire (2 hours).
--
-- RLS: guest_invites is read by the inviter and by staff with Today on;
-- guest_details (phone + health answers) only by staff with Check-ins on,
-- matching other health data (0042/0043). Neither table has write
-- policies — every write goes through the functions below. The invite
-- token is never readable through the API (column grants).
-- Run AFTER 0049.
-- ============================================================================

begin;

create table guest_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  invited_by uuid not null references profiles (id) on delete cascade,
  guest_name text not null check (length(trim(guest_name)) between 1 and 80),
  guest_email text not null check (guest_email = lower(trim(guest_email)) and guest_email like '%_@_%._%'),
  token uuid not null unique default gen_random_uuid(),
  status text not null default 'invited'
    check (status in ('invited', 'confirmed', 'declined', 'cancelled')),
  confirmed_at timestamptz,
  joined_member_id uuid references profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table guest_invites is
  'Refer a friend: a member brings someone from outside the gym to a class, free. The guest confirms by emailed link (token), no account. Holds a class place while confirmed, or while invited until 3h before the class.';

create index idx_guest_invites_session on guest_invites (session_id);
create index idx_guest_invites_inviter on guest_invites (invited_by, created_at desc);
create index idx_guest_invites_email on guest_invites (guest_email);

create table guest_details (
  invite_id uuid primary key references guest_invites (id) on delete cascade,
  phone text not null,
  health_any_yes boolean not null,
  health_notes text,
  consented_at timestamptz not null default now()
);

comment on table guest_details is
  'What a guest gives when confirming: phone and health-screening answers (special category data, consent recorded). Staff with Check-ins on only.';

alter table guest_invites enable row level security;
alter table guest_details enable row level security;

create policy "guest_invites: read"
  on guest_invites for select
  to authenticated
  using ((select auth.uid()) = invited_by or staff_can_view('today'));

create policy "guest_details: read"
  on guest_details for select
  to authenticated
  using (staff_can_view('checkins'));

-- The token is the guest's key: nobody reads it through the API.
revoke all on guest_invites from anon, authenticated;
grant select (id, session_id, invited_by, guest_name, guest_email, status, confirmed_at,
              joined_member_id, joined_at, created_at)
  on guest_invites to authenticated;
revoke all on guest_details from anon, authenticated;
grant select on guest_details to authenticated;

-- ----------------------------------------------------------------------------
-- guest_spots_held — places guests hold in a class. Confirmed guests, plus
-- invited ones until 3 hours before the start (UK wall-clock time).
-- ----------------------------------------------------------------------------
create or replace function guest_spots_held(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from guest_invites g
  join sessions s on s.id = g.session_id
  where g.session_id = p_session_id
    and (
      g.status = 'confirmed'
      or (g.status = 'invited'
          and (s.session_date + s.start_time) - interval '3 hours' > (now() at time zone 'Europe/London'))
    );
$$;

revoke execute on function guest_spots_held(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Capacity checks now count guests. Bodies are the latest versions
-- (book_session from 0040, promote_waitlist / join_waitlist from 0010)
-- with only the reserved-places count changed.
-- ----------------------------------------------------------------------------
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

create or replace function promote_waitlist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_booked integer;
  v_reserved integer;
  v_available integer;
  v_entry waitlist_entries%rowtype;
  v_buddy_entry waitlist_entries%rowtype;
  v_handled uuid[] := '{}';
begin
  -- Sweep stale offers first. A buddy pairing only stands together: if one
  -- half times out, the other half reverts to 'waiting' (keeps their
  -- place) rather than being expired too.
  for v_entry in
    select * from waitlist_entries
    where session_id = p_session_id and status = 'offered' and offer_expires_at < now()
  loop
    update waitlist_entries set status = 'expired' where id = v_entry.id;

    if v_entry.buddy_member_id is not null then
      update waitlist_entries
      set status = 'waiting', offered_at = null, offer_expires_at = null
      where session_id = p_session_id
        and member_id = v_entry.buddy_member_id
        and status = 'offered';
    end if;
  end loop;

  select capacity into v_capacity from sessions where id = p_session_id for update;
  select count(*) into v_booked from bookings
    where session_id = p_session_id and status = 'booked';
  -- New in 0050: guests (refer a friend) hold a place too.
  select count(*) + guest_spots_held(p_session_id) into v_reserved from waitlist_entries
    where session_id = p_session_id and status = 'offered';

  v_available := v_capacity - v_booked - v_reserved;

  if v_available <= 0 then
    return;
  end if;

  for v_entry in
    select * from waitlist_entries
    where session_id = p_session_id and status = 'waiting'
    order by position
  loop
    if v_available <= 0 then
      exit;
    end if;

    if v_entry.member_id = any (v_handled) then
      continue;
    end if;

    if v_entry.buddy_member_id is not null then
      select * into v_buddy_entry from waitlist_entries
        where session_id = p_session_id
          and member_id = v_entry.buddy_member_id
          and status = 'waiting';

      if found and v_available >= 2 then
        update waitlist_entries
          set status = 'offered', offered_at = now(), offer_expires_at = now() + interval '2 hours'
          where id in (v_entry.id, v_buddy_entry.id);

        v_available := v_available - 2;
        v_handled := v_handled || v_entry.member_id || v_buddy_entry.member_id;
      end if;
      -- else: can't fulfil the pair yet (buddy hasn't joined, or only 1
      -- spot free) — leave both waiting and try the next entry.
    else
      update waitlist_entries
        set status = 'offered', offered_at = now(), offer_expires_at = now() + interval '2 hours'
        where id = v_entry.id;

      v_available := v_available - 1;
      v_handled := v_handled || v_entry.member_id;
    end if;
  end loop;
end;
$$;

revoke execute on function promote_waitlist(uuid) from public, anon, authenticated;

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

-- "X/Y booked" on the timetable — one row per session asked about, guests included.
create or replace function session_spots_taken(p_session_ids uuid[])
returns table (session_id uuid, spots_taken bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ids.id,
         (select count(*) from bookings b
           where b.session_id = ids.id
             and (b.status = 'booked' or (b.status = 'invited' and b.invite_expires_at > now())))
         + guest_spots_held(ids.id)
  from unnest(p_session_ids) as ids(id);
$$;

-- ----------------------------------------------------------------------------
-- guest_passes_left — the caller's passes this UK calendar month: 1, plus
-- one per guest of theirs who became a member this month, minus invites
-- this month still holding a place (declined / cancelled / lapsed ones
-- give the pass back).
-- ----------------------------------------------------------------------------
create or replace function guest_passes_left()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with month as (
    select date_trunc('month', now() at time zone 'Europe/London') as starts
  )
  select greatest(0,
    1
    + (select count(distinct g.guest_email) from guest_invites g, month
        where g.invited_by = auth.uid()
          and (g.joined_at at time zone 'Europe/London') >= month.starts)::int
    - (select count(*) from guest_invites g
        join sessions s on s.id = g.session_id
        cross join month
        where g.invited_by = auth.uid()
          and (g.created_at at time zone 'Europe/London') >= month.starts
          and (g.status = 'confirmed'
               or (g.status = 'invited'
                   and (s.session_date + s.start_time) - interval '3 hours' > (now() at time zone 'Europe/London'))))::int
  );
$$;

revoke execute on function guest_passes_left() from public, anon;
grant execute on function guest_passes_left() to authenticated;

-- ----------------------------------------------------------------------------
-- invite_guest — the inviter must be booked into the class. Returns the
-- token so the app can email the guest their link.
-- ----------------------------------------------------------------------------
create or replace function invite_guest(p_session_id uuid, p_name text, p_email text)
returns table (invite_id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_session sessions%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_taken integer;
  v_invite guest_invites%rowtype;
begin
  if v_member_id is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Enter your friend''s name.';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email doesn''t look right.';
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then
    raise exception 'This class isn''t open for booking.';
  end if;

  if (v_session.session_date + v_session.start_time) - interval '3 hours' <= (now() at time zone 'Europe/London') then
    raise exception 'It''s too close to the class to bring a guest — message us and we''ll sort something out.';
  end if;

  if not exists (
    select 1 from bookings
    where session_id = p_session_id and member_id = v_member_id and status = 'booked'
  ) then
    raise exception 'Book yourself in first, then you can bring a friend.';
  end if;

  if exists (select 1 from profiles where lower(email) = v_email) then
    raise exception 'They''re already a member — they can book themselves in.';
  end if;

  if exists (
    select 1 from guest_invites
    where session_id = p_session_id and guest_email = v_email and status in ('invited', 'confirmed')
  ) then
    raise exception 'They''ve already been invited to this class.';
  end if;

  if guest_passes_left() < 1 then
    raise exception 'You''ve used your guest pass this month. You get another if your guest signs up.';
  end if;

  select count(*) into v_taken from bookings
  where session_id = p_session_id
    and (status = 'booked' or (status = 'invited' and invite_expires_at > now()));
  v_taken := v_taken
    + (select count(*) from waitlist_entries where session_id = p_session_id and status = 'offered')
    + guest_spots_held(p_session_id);

  if v_taken >= v_session.capacity then
    raise exception 'This class is full — message us and we''ll sort something out.';
  end if;

  insert into guest_invites (session_id, invited_by, guest_name, guest_email)
  values (p_session_id, v_member_id, trim(p_name), v_email)
  returning * into v_invite;

  return query select v_invite.id, v_invite.token;
end;
$$;

revoke execute on function invite_guest(uuid, text, text) from public, anon;
grant execute on function invite_guest(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- cancel_guest_invite — the inviter takes it back; the place is freed.
-- ----------------------------------------------------------------------------
create or replace function cancel_guest_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite guest_invites%rowtype;
begin
  select * into v_invite from guest_invites where id = p_invite_id for update;
  if not found or v_invite.invited_by <> auth.uid() then
    raise exception 'Invite not found';
  end if;
  if v_invite.status not in ('invited', 'confirmed') then
    raise exception 'This invite is no longer active';
  end if;

  update guest_invites set status = 'cancelled' where id = p_invite_id;
  perform promote_waitlist(v_invite.session_id);
end;
$$;

revoke execute on function cancel_guest_invite(uuid) from public, anon;
grant execute on function cancel_guest_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- get_guest_invite / respond_guest_invite — the guest's emailed link. No
-- account, so these are callable without signing in; the unguessable token
-- is the only key, and they return only what the guest page shows.
-- ----------------------------------------------------------------------------
create or replace function get_guest_invite(p_token uuid)
returns table (
  guest_name text,
  inviter_first_name text,
  class_name text,
  session_date date,
  start_time time,
  status text,
  lapsed boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select g.guest_name,
         split_part(coalesce(p.full_name, 'A friend'), ' ', 1),
         coalesce(t.name, 'Class'),
         s.session_date,
         s.start_time,
         g.status,
         g.status = 'invited'
           and (s.session_date + s.start_time) - interval '3 hours' <= (now() at time zone 'Europe/London')
  from guest_invites g
  join sessions s on s.id = g.session_id
  left join session_templates t on t.id = s.template_id
  left join profiles p on p.id = g.invited_by
  where g.token = p_token;
$$;

revoke execute on function get_guest_invite(uuid) from public;
grant execute on function get_guest_invite(uuid) to anon, authenticated;

create or replace function respond_guest_invite(
  p_token uuid,
  p_accept boolean,
  p_phone text default null,
  p_health_any_yes boolean default null,
  p_health_notes text default null,
  p_consent boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite guest_invites%rowtype;
  v_session sessions%rowtype;
begin
  select * into v_invite from guest_invites where token = p_token for update;
  if not found then
    raise exception 'This invite link isn''t valid.';
  end if;
  if v_invite.status <> 'invited' then
    raise exception 'This invite has already been answered.';
  end if;

  select * into v_session from sessions where id = v_invite.session_id;
  if (v_session.session_date + v_session.start_time) - interval '3 hours' <= (now() at time zone 'Europe/London') then
    raise exception 'This invite needed confirming at least 3 hours before the class, so the place has been released.';
  end if;

  if not p_accept then
    update guest_invites set status = 'declined' where id = v_invite.id;
    perform promote_waitlist(v_invite.session_id);
    return 'declined';
  end if;

  if length(trim(coalesce(p_phone, ''))) < 6 then
    raise exception 'Add a phone number so we can reach you on the day.';
  end if;
  if p_health_any_yes is null then
    raise exception 'Answer the health questions.';
  end if;
  if p_health_any_yes and length(trim(coalesce(p_health_notes, ''))) = 0 then
    raise exception 'Tell us a bit about the health question you said yes to.';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Tick the box so we can keep your health answers for the session.';
  end if;

  insert into guest_details (invite_id, phone, health_any_yes, health_notes)
  values (v_invite.id, trim(p_phone), p_health_any_yes, nullif(trim(coalesce(p_health_notes, '')), ''));

  update guest_invites set status = 'confirmed', confirmed_at = now() where id = v_invite.id;
  return 'confirmed';
end;
$$;

revoke execute on function respond_guest_invite(uuid, boolean, text, boolean, text, boolean) from public;
grant execute on function respond_guest_invite(uuid, boolean, text, boolean, text, boolean) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- A guest who becomes a member earns their inviter another pass. profiles
-- .email is copied from auth.users (0044), so it can't be spoofed.
-- ----------------------------------------------------------------------------
create or replace function mark_guest_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.role = 'member' then
    update guest_invites
    set joined_member_id = new.id, joined_at = now()
    where guest_email = lower(new.email) and joined_member_id is null;
  end if;
  return new;
end;
$$;

revoke execute on function mark_guest_joined() from public, anon, authenticated;

create trigger trg_profiles_mark_guest_joined
  after insert or update of email on profiles
  for each row execute function mark_guest_joined();

-- ----------------------------------------------------------------------------
-- Guests only: member-to-member buddy invites are retired.
-- ----------------------------------------------------------------------------
revoke execute on function invite_buddy(uuid, uuid) from public, anon, authenticated;

commit;
