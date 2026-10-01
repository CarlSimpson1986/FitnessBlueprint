-- ============================================================================
-- 0038_staff_two_factor.sql
-- Coaches and the owner must sign in with two-factor (an authenticator
-- code, Supabase TOTP MFA) before any staff-level access works. A stolen
-- staff password alone then gets nothing beyond that person's own
-- profile — the same as a member.
--
-- Enforced here, in the two functions every staff RLS policy goes
-- through (is_coach_or_owner / is_owner, 0002), not just in the app:
-- the session's JWT must be at assurance level aal2, i.e. the code was
-- entered this session. The app (src/lib/auth.ts) sends staff without it
-- to /login/two-factor to set up or enter their code.
--
-- Exempt: the owner's "View as" test accounts (app_metadata.test_account,
-- src/lib/test-accounts.ts). Their passwords are random and never shown;
-- the only way in is the owner-only switch, which itself requires the
-- owner's two-factor session.
--
-- Unaffected: the service-role (admin) client used by the cron, webhooks
-- and Coach Ted's pipeline bypasses RLS entirely. Every call to these two
-- functions is inside an RLS policy (checked 2026-10-01), none in an RPC
-- body that the admin client might run.
-- ============================================================================

create or replace function staff_session_verified()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or (auth.jwt() -> 'app_metadata' ->> 'test_account') is not null;
$$;

comment on function staff_session_verified() is
  'True when this session passed two-factor (aal2), or is an owner-only View-as test account. Required by is_coach_or_owner() / is_owner() since 0038.';

create or replace function is_coach_or_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(auth_role() in ('coach', 'owner'), false) and staff_session_verified();
$$;

create or replace function is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(auth_role() = 'owner', false) and staff_session_verified();
$$;
