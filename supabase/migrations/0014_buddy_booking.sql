-- ============================================================================
-- 0014_buddy_booking.sql
-- Buddy booking for a normal (non-waitlist) session — "invite-and-reserve"
-- per the owner's confirmed preference: a member who's already booked can
-- invite a buddy by email; the invite reserves a real spot (counted in
-- capacity everywhere a booked spot is) for 2 hours without spending the
-- buddy's credit. The buddy accepts (spends their own credit, same checks
-- as a normal booking) or declines; either way — or if the invite times
-- out — the spot frees back up and the waitlist is swept, same as any
-- other freed spot. MUST be run as a separate query AFTER 0013 has
-- finished (see that file for why).
--
-- Schema: reuses bookings rather than a new table — a pending invite IS a
-- reserved booking, just not confirmed yet. New nullable columns:
-- invited_by (who sent it) and invite_expires_at (when the reservation
-- lapses, mirroring waitlist_entries.offer_expires_at).
-- ============================================================================

alter table bookings
  add column invited_by uuid references profiles (id),
  add column invite_expires_at timestamptz;

-- ----------------------------------------------------------------------------
-- book_session — redefined again (see 0010, 0012) to also treat
-- non-expired 'invited' bookings as taken capacity, so a bystander can't
-- book into a spot reserved (but not yet accepted) via a buddy invite.
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

-- ----------------------------------------------------------------------------
-- session_spots_taken — redefined (see 0005) to also count non-expired
-- 'invited' bookings, so the displayed "X/Y booked" reflects reserved
-- buddy spots too.
-- ----------------------------------------------------------------------------
create or replace function session_spots_taken(p_session_ids uuid[])
returns table (session_id uuid, spots_taken bigint)
language sql
stable
security definer
set search_path = public
as $$
  select bookings.session_id, count(*) as spots_taken
  from bookings
  where bookings.session_id = any(p_session_ids)
    and (status = 'booked' or (status = 'invited' and invite_expires_at > now()))
  group by bookings.session_id;
$$;

-- ----------------------------------------------------------------------------
-- invite_buddy — the inviter must already be booked in. Upserts on
-- (session_id, member_id) so re-inviting someone whose previous invite
-- lapsed or was declined works rather than hitting the unique constraint.
-- ----------------------------------------------------------------------------
create or replace function invite_buddy(p_session_id uuid, p_buddy_member_id uuid)
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
  v_existing_status booking_status;
  v_booking bookings%rowtype;
begin
  if v_member_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_buddy_member_id = v_member_id then
    raise exception 'You can''t invite yourself';
  end if;

  if not exists (
    select 1 from bookings
    where session_id = p_session_id and member_id = v_member_id and status = 'booked'
  ) then
    raise exception 'Book yourself in before inviting a buddy';
  end if;

  if not exists (
    select 1 from profiles where id = p_buddy_member_id and role = 'member'
  ) then
    raise exception 'Buddy not found';
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then
    raise exception 'This session is not open for booking';
  end if;

  select status into v_existing_status from bookings
  where session_id = p_session_id and member_id = p_buddy_member_id;

  if v_existing_status in ('booked', 'attended') then
    raise exception 'They already have a booking for this session';
  end if;

  select count(*) into v_taken from bookings
  where session_id = p_session_id
    and member_id <> p_buddy_member_id
    and (status = 'booked' or (status = 'invited' and invite_expires_at > now()));

  select count(*) into v_reserved from waitlist_entries
  where session_id = p_session_id and status = 'offered';

  if v_taken + v_reserved >= v_session.capacity then
    raise exception 'Session is full — try the waitlist instead';
  end if;

  insert into bookings (session_id, member_id, status, invited_by, invite_expires_at)
  values (p_session_id, p_buddy_member_id, 'invited', v_member_id, now() + interval '2 hours')
  on conflict (session_id, member_id)
  do update set
    status = 'invited',
    invited_by = v_member_id,
    invite_expires_at = now() + interval '2 hours',
    cancelled_at = null,
    credit_ledger_id = null,
    booked_at = now()
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function invite_buddy(uuid, uuid) from public, anon;
grant execute on function invite_buddy(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- accept_booking_invite — same membership/credit checks as book_session,
-- since accepting spends the INVITEE's own credit, not the inviter's.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- decline_booking_invite — invitee says no. Frees the reserved spot and
-- sweeps the waitlist, same as any other freed spot.
-- ----------------------------------------------------------------------------
create or replace function decline_booking_invite(p_booking_id uuid)
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
    raise exception 'Invite not found';
  end if;

  if v_booking.member_id <> v_member_id then
    raise exception 'Not your invite';
  end if;

  if v_booking.status <> 'invited' then
    raise exception 'This invite is no longer active';
  end if;

  update bookings
  set status = 'cancelled', cancelled_at = now(), invite_expires_at = null
  where id = p_booking_id
  returning * into v_booking;

  perform promote_waitlist(v_booking.session_id);

  return v_booking;
end;
$$;

revoke execute on function decline_booking_invite(uuid) from public, anon;
grant execute on function decline_booking_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- withdraw_booking_invite — inviter changes their mind before the buddy
-- responds. Same effect as a decline, just triggered by the other side.
-- ----------------------------------------------------------------------------
create or replace function withdraw_booking_invite(p_booking_id uuid)
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
    raise exception 'Invite not found';
  end if;

  if v_booking.invited_by <> v_member_id then
    raise exception 'Not your invite to withdraw';
  end if;

  if v_booking.status <> 'invited' then
    raise exception 'This invite is no longer active';
  end if;

  update bookings
  set status = 'cancelled', cancelled_at = now(), invite_expires_at = null
  where id = p_booking_id
  returning * into v_booking;

  perform promote_waitlist(v_booking.session_id);

  return v_booking;
end;
$$;

revoke execute on function withdraw_booking_invite(uuid) from public, anon;
grant execute on function withdraw_booking_invite(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS — an inviter needs to read the buddy's booking row (to show "waiting
-- on Jane's response") even though "members read own bookings" (0002) only
-- covers member_id = auth.uid(). Same shape as 0010's waitlist-buddy
-- profile policy, applied here to bookings + profiles.
-- ----------------------------------------------------------------------------
create policy "members read invites they sent"
  on bookings for select
  using (auth.uid() = invited_by);

create policy "members read buddy profiles for booking invites"
  on profiles for select
  using (
    exists (
      select 1 from bookings
      where (member_id = auth.uid() and invited_by = profiles.id)
         or (invited_by = auth.uid() and member_id = profiles.id)
    )
  );
