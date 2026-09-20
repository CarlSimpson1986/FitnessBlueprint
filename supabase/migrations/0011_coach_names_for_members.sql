-- ============================================================================
-- 0011_coach_names_for_members.sql
-- Fixes a latent bug found while building the waitlist (0010): members
-- render "Coach TBC" for every session because 0002's profiles RLS only
-- lets a member read their OWN row, not a coach's. `/admin` never hit this
-- because coaches/owner already have a full-read policy on profiles.
--
-- Deliberately NOT fixed with a plain "members read coach/owner profile
-- rows" RLS policy — RLS is row-level, not column-level, so that would let
-- any member query the REST API directly for a coach's phone number and
-- emergency contact alongside their name. Instead, same pattern as
-- lookup_member_by_email (0010): a narrow security-definer RPC that only
-- ever returns id/full_name.
-- ============================================================================

create or replace function list_coach_names()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select id, full_name from profiles
  where role in ('coach', 'owner');
$$;

revoke execute on function list_coach_names() from public, anon;
grant execute on function list_coach_names() to authenticated;
