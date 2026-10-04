-- ============================================================================
-- 0049_checkin_actions.sql
-- Two more weekly check-in questions (Carl, 2026-10-04 run-through):
--   - after "What got in the way?": one thing to put in place to get round
--     it next week
--   - the number 1 action to take to progress next week
--
-- New columns on an existing table: the row policies from 0046
-- ("weekly_checkins: read/create") already cover them, including the 0043
-- health-consent rule and staff_can_view('checkins'). No policy changes.
-- Run AFTER 0048.
-- ============================================================================

begin;

alter table weekly_checkins
  add column workaround text,
  add column next_week_action text;

comment on column weekly_checkins.workaround is
  'One thing the member will put in place next week to get round what got in the way (struggle).';
comment on column weekly_checkins.next_week_action is
  'The member''s number 1 action to progress next week.';

commit;
