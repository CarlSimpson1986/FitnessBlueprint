-- ============================================================================
-- 0008_profiles_email.sql
-- profiles never stored email, on either signup path (self-service
-- onboarding or owner-created accounts) — it only ever lived on
-- auth.users, which isn't reachable from the RLS-respecting client.
-- Result: the owner's member list had no way to show or use a member's
-- email at all. Store it on profiles at creation time instead of
-- fetching auth.users via the admin client on every read.
-- ============================================================================

alter table profiles add column email text not null default '';
alter table profiles alter column email drop default;
