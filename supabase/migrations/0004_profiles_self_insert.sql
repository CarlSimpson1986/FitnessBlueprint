-- ============================================================================
-- 0004_profiles_self_insert.sql
-- Allow a newly signed-up member to create their own profile row.
--
-- 0002 deliberately left profiles with no insert policy for members,
-- since at the time signup provisioning hadn't been decided. Self-service
-- signup (magic link -> onboarding form) needs this: a member can only
-- insert a row for their own auth.uid(), and only as role = 'member' —
-- nobody can self-promote to coach/owner via signup.
-- ============================================================================

create policy "members insert own profile"
  on profiles for insert
  with check (auth.uid() = id and role = 'member');
