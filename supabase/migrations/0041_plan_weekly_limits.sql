-- ============================================================================
-- 0041_plan_weekly_limits.sql
-- 0040 added "Hyrox only" and the 21-day starter with no weekly limit (a
-- guess). Confirmed 2026-10-02: both are 3 sessions a week — the starter
-- is 3 a week for its 3 weeks (programme_length_days 21, unchanged).
-- book_session() and accept_booking_invite() already enforce
-- sessions_per_week, so this is data only. Run AFTER 0040.
-- ============================================================================

update membership_plans set sessions_per_week = 3
where code in ('hyrox_only', 'starter_21d');
