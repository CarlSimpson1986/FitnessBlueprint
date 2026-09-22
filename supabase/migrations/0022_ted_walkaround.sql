-- ============================================================================
-- 0022_ted_walkaround.sql
-- Tracks whether a member has seen the "Ted walk-around" — a one-time
-- guided intro to the app shown the first time they land on the
-- homepage. Not derivable from any existing data (a member could have
-- zero bookings/goals/metrics and still have already dismissed the
-- tour), so this needs its own flag rather than the read-time-from-
-- row-existence convention used elsewhere in this schema.
-- ============================================================================

alter table profiles
  add column has_seen_ted_tour boolean not null default false;

comment on column profiles.has_seen_ted_tour is
  'Whether this member has dismissed the one-time Ted walk-around intro. Set once, never reset — re-showing it isn''t a feature.';

-- No new RLS policy needed — "members update own profile" (0002) already
-- lets a member update their own row as long as role stays ''member'',
-- and this column isn't role.
