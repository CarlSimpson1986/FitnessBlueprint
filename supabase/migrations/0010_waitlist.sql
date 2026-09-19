-- ============================================================================
-- 0010_waitlist.sql
-- Waitlist app code — the schema (waitlist_entries, buddy_member_id) has
-- existed since 0001 with zero app code reading or writing it. This wires
-- it up as timed offers (matches the offered/offer_expires_at columns
-- already in the schema, not an instant auto-book), including buddy
-- pairing: "only promote me if my friend also gets a spot" per the
-- owner's confirmed feature priority.
--
-- Flow:
--  - join_waitlist: member joins a full session's waitlist, optionally
--    naming a buddy (by member id, resolved client-side via
--    lookup_member_by_email — members can't otherwise read another
--    member's profile row, see the new RLS policy below).
--  - promote_waitlist: called whenever a spot opens (cancel_booking,
--    leave_waitlist, accept_waitlist_offer) — sweeps expired offers,
--    then offers the freed spot(s) to the next waiting entry in
--    position order. A buddy entry is only offered together with its
--    buddy's own waiting entry, and only if 2 spots are free; otherwise
--    it's skipped (not blocking) until enough spots are free at once.
--  - accept_waitlist_offer: member turns an active offer into a real
--    booking (still goes through book_session, so membership/credit
--    checks apply same as a normal booking).
--  - leave_waitlist: member withdraws from the waitlist, or declines an
--    offer. Declining/expiring one half of a buddy pair reverts the
--    other half's offer back to 'waiting' rather than losing their
--    place — the pairing failed, not the individual.
--
-- No push notifications or cron exist yet (see ROADMAP.md), so offers
-- are swept lazily (on the next promote_waitlist/accept call) rather
-- than by a scheduled job. A member only finds out about an offer by
-- opening the app — acceptable for v1, worth revisiting if members
-- report missing offers before the 2-hour window closes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- book_session — redefined to also treat active waitlist offers as
-- reserved capacity, so a bystander can't book into a spot that's been
-- offered (but not yet accepted) to someone off the waitlist.
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

  select count(*) into v_reserved from waitlist_entries
  where session_id = p_session_id and status = 'offered';

  if v_taken + v_reserved >= v_session.capacity then
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

-- ----------------------------------------------------------------------------
-- promote_waitlist — internal only (not granted to authenticated). Sweeps
-- expired offers, then offers freed spots to the next waiting entries in
-- position order. Called from cancel_booking / leave_waitlist /
-- accept_waitlist_offer, all of which run as security definer, so the
-- nested call runs with this function owner's privileges regardless of
-- who the calling member is.
-- ----------------------------------------------------------------------------
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
  select count(*) into v_reserved from waitlist_entries
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

revoke all on function promote_waitlist(uuid) from public;

-- ----------------------------------------------------------------------------
-- cancel_booking — redefined to promote the waitlist once a spot frees up.
-- ----------------------------------------------------------------------------
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

  perform promote_waitlist(v_booking.session_id);

  return v_booking;
end;
$$;

-- ----------------------------------------------------------------------------
-- join_waitlist
-- ----------------------------------------------------------------------------
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
  select count(*) into v_reserved from waitlist_entries
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

revoke execute on function join_waitlist(uuid, uuid) from public, anon;
grant execute on function join_waitlist(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- leave_waitlist — withdraw a waiting entry, or decline an active offer.
-- ----------------------------------------------------------------------------
create or replace function leave_waitlist(p_entry_id uuid)
returns waitlist_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_entry waitlist_entries%rowtype;
  v_was_offered boolean;
begin
  select * into v_entry from waitlist_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Waitlist entry not found';
  end if;

  if v_entry.member_id <> v_member_id then
    raise exception 'Not your waitlist entry';
  end if;

  if v_entry.status not in ('waiting', 'offered') then
    raise exception 'This waitlist entry is no longer active';
  end if;

  v_was_offered := v_entry.status = 'offered';

  update waitlist_entries set status = 'declined' where id = p_entry_id;

  if v_was_offered and v_entry.buddy_member_id is not null then
    update waitlist_entries
      set status = 'waiting', offered_at = null, offer_expires_at = null
      where session_id = v_entry.session_id
        and member_id = v_entry.buddy_member_id
        and status = 'offered';
  end if;

  perform promote_waitlist(v_entry.session_id);

  select * into v_entry from waitlist_entries where id = p_entry_id;
  return v_entry;
end;
$$;

revoke execute on function leave_waitlist(uuid) from public, anon;
grant execute on function leave_waitlist(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- accept_waitlist_offer — turns an active offer into a real booking via
-- book_session, so membership/credit rules apply exactly as normal.
-- ----------------------------------------------------------------------------
create or replace function accept_waitlist_offer(p_entry_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid := auth.uid();
  v_entry waitlist_entries%rowtype;
  v_session_id uuid;
  v_booking bookings%rowtype;
begin
  if v_member_id is null then
    raise exception 'Not authenticated';
  end if;

  select session_id into v_session_id from waitlist_entries where id = p_entry_id;
  if v_session_id is null then
    raise exception 'Waitlist entry not found';
  end if;

  -- Sweep first so a stale offer can't be accepted past its window.
  perform promote_waitlist(v_session_id);

  select * into v_entry from waitlist_entries where id = p_entry_id for update;

  if v_entry.member_id <> v_member_id then
    raise exception 'Not your waitlist entry';
  end if;

  if v_entry.status <> 'offered' or v_entry.offer_expires_at < now() then
    raise exception 'This offer is no longer available';
  end if;

  update waitlist_entries set status = 'accepted' where id = p_entry_id;

  begin
    select * into v_booking from book_session(v_entry.session_id);
  exception when others then
    update waitlist_entries
      set status = 'offered'
      where id = p_entry_id;
    raise;
  end;

  return v_booking;
end;
$$;

revoke execute on function accept_waitlist_offer(uuid) from public, anon;
grant execute on function accept_waitlist_offer(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- lookup_member_by_email — the only way a member can resolve another
-- member's id client-side (RLS otherwise limits a member to reading only
-- their own profile row, see 0002). Deliberately narrow: exact email
-- match, members only, and returns just id/full_name — used solely to
-- resolve a buddy nomination when joining a waitlist.
-- ----------------------------------------------------------------------------
create or replace function lookup_member_by_email(p_email text)
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, full_name from profiles
  where email = p_email and role = 'member';
$$;

revoke execute on function lookup_member_by_email(text) from public, anon;
grant execute on function lookup_member_by_email(text) to authenticated;

-- ----------------------------------------------------------------------------
-- profiles RLS — let a member read their waitlist buddy's name (needed to
-- display "waitlisted with <name>"). Narrowly scoped to only the profile
-- row on the other end of a waitlist_entries link the caller is part of —
-- does not open up profiles browsing generally.
-- ----------------------------------------------------------------------------
create policy "members read waitlist buddy profiles"
  on profiles for select
  using (
    exists (
      select 1 from waitlist_entries
      where (member_id = auth.uid() and buddy_member_id = profiles.id)
         or (buddy_member_id = auth.uid() and member_id = profiles.id)
    )
  );
