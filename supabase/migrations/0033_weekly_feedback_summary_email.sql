-- ============================================================================
-- 0033_weekly_feedback_summary_email.sql
-- Monday email to the owner with Coach Ted's summary of the week's
-- feedback comments and check-ins (src/lib/coach-ted/weekly-summary.ts,
-- sent by src/app/api/cron/reminders/route.ts). email_log needs the new
-- type so the send stays once-per-week idempotent like the others.
-- ============================================================================

alter type email_type add value if not exists 'weekly_feedback_summary';
