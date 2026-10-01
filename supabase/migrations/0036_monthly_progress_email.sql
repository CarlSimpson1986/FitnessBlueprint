-- ============================================================================
-- 0036_monthly_progress_email.sql
-- Monthly progress stats email to each member (Guy's spec notes,
-- 2026-10): last month's sessions, week streak, total lifted and new
-- bests. Built in src/lib/monthly-progress.ts, sent by the daily cron
-- (src/app/api/cron/reminders/route.ts) in the first days of the month.
-- email_log needs the new type so it stays once-per-month idempotent,
-- keyed by the month ('2026-10').
-- ============================================================================

alter type email_type add value if not exists 'monthly_progress_report';
