-- ============================================================================
-- 0013_booking_invited_status.sql
-- Adds 'invited' to booking_status, for buddy booking (0014).
--
-- Deliberately its own migration/transaction, with nothing else in it:
-- Postgres won't let a new enum value be used (in an INSERT/UPDATE, or a
-- function body that gets created/replaced) in the same transaction that
-- adds it. Run this one on its own in the SQL Editor, let it finish, THEN
-- run 0014 as a separate query — pasting both into one query and running
-- together will fail with "unsafe use of new value of enum type".
-- ============================================================================

alter type booking_status add value 'invited';
