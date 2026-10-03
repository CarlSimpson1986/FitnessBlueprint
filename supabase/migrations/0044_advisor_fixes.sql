-- ============================================================================
-- 0044_advisor_fixes.sql
-- Fixes from the Supabase Security Advisor run on 2026-10-03.
--
-- Supabase grants EXECUTE on every new public function to anon and
-- authenticated directly, so `revoke ... from public` (0010) never took
-- those away. Revoke from the roles by name.
-- ============================================================================

-- promote_waitlist is only meant to be called from inside the booking /
-- waitlist functions (which run as security definer, so they keep access).
-- It was callable by anyone, even signed out, via /rest/v1/rpc.
revoke execute on function promote_waitlist(uuid) from public, anon, authenticated;

-- Created in the dashboard (Supabase's auto-enable-RLS event trigger), not
-- by a migration, so a database rebuilt from migrations won't have it —
-- hence the existence check. Event triggers don't need EXECUTE.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- 0043's helpers answered for any member id, so anyone with an id could
-- learn whether that member had agreed to share health info. RLS policies
-- call them, so they stay executable — but now only answer for yourself or
-- for staff (who need it for the "coaches and owner read ..." policies).
create or replace function has_health_consent(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (p_member_id = auth.uid() or is_coach_or_owner())
     and coalesce((select health_consent from profiles where id = p_member_id), false);
$$;

create or replace function tracks_body_metrics(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (p_member_id = auth.uid() or is_coach_or_owner())
     and coalesce(
       (select health_consent and track_body_metrics from profiles where id = p_member_id),
       false
     );
$$;

-- Trigger function with no fixed search_path (advisor lint 0011).
alter function set_updated_at() set search_path = public;

-- ============================================================================
-- Member write back doors, found in the 2026-10-03 RLS audit. The app only
-- ever writes these through the security-definer RPCs (book_session,
-- cancel_booking, join_waitlist, leave_waitlist, accept_waitlist_offer,
-- invite/accept/decline/withdraw_booking_invite, mark_self_attended) —
-- those run as the function owner and don't need these policies.
-- ============================================================================

-- A member could insert their own booking straight into bookings, skipping
-- credits, capacity, weekly limits, plan restrictions and the booking
-- window that book_session() enforces.
drop policy "members create own bookings" on bookings;

-- A member could mark any of their bookings cancelled directly — skipping
-- cancel_booking()'s refund/late-cancel rules and the waitlist promotion,
-- and turning an 'attended' row into 'cancelled'.
drop policy "members cancel own bookings" on bookings;

-- Direct insert/update let a member set their own entry to 'offered' (or
-- position 0) and then accept_waitlist_offer() into a full class.
drop policy "members join waitlist" on waitlist_entries;
drop policy "members update own waitlist entry" on waitlist_entries;

-- No WITH CHECK meant a member could edit their post into an official
-- 'gym' event, or hand it to someone else's created_by.
drop policy "creator or owner edits event" on events;
create policy "creator or owner edits event"
  on events for update
  using (auth.uid() = created_by or is_owner())
  with check (is_owner() or (auth.uid() = created_by and event_type = 'member_posted'));

-- profiles.email is what the Stripe webhook matches a payment to, and
-- members could set their own (on insert at onboarding, or any update) —
-- e.g. to someone else's address, so that person's payment activated the
-- attacker's account. Always copy it from auth.users instead; that's the
-- address they actually signed in with, and every create path already
-- writes that same value.
create or replace function sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := coalesce((select email from auth.users where id = new.id), new.email);
  return new;
end;
$$;

revoke execute on function sync_profile_email() from public, anon, authenticated;

create trigger trg_profiles_sync_email
  before insert or update of email on profiles
  for each row execute function sync_profile_email();

-- The trigger only covers writes from now on: re-sync every existing row
-- so an address changed before this migration can't still catch a payment.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id and u.email is not null and p.email is distinct from u.email;

-- ----------------------------------------------------------------------------
-- Coach attendance updates (0042's policy) only checked the new status, so
-- a coach could also move a booking to another session or member, or
-- re-point its credit. Direct API updates by anyone but the owner may now
-- change status only. The booking RPCs run as the function owner
-- (current_user is not 'authenticated'), so they're unaffected.
-- ----------------------------------------------------------------------------
-- Deliberately NOT security definer: current_user has to be the caller.
create or replace function guard_booking_direct_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' and not is_owner()
     and (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Only the attendance status can be changed here';
  end if;
  return new;
end;
$$;

create trigger trg_bookings_guard_direct_update
  before update on bookings
  for each row execute function guard_booking_direct_update();

-- Known gap, not fixed here: RLS is per row, so a coach can still read
-- weekly_checkins.weight_kg for a member who has since turned off body
-- measurements (0043's header says otherwise). The coach check-ins page
-- hides it; a direct API read would not.
