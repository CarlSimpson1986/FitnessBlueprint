-- ============================================================================
-- 0048_goal_tracking.sql
-- Goals that can actually be tracked (Carl, 2026-10-04 run-through: goals
-- need waist and hips, strength, and room for anything else).
--
--   - body_metrics.hip_cm: hips alongside weight / waist / body fat. The
--     0017 "has a value" check is widened so a hips-only entry saves.
--   - goals.start_value: where the member was when they set the goal, so
--     the Goals card can show Start -> Now -> Target. Null when they didn't
--     give a number (a free-text goal, or they skipped it).
--
-- New columns on existing tables: the row policies from 0046
-- ("body_metrics: read/create", "goals: read/create/change") already cover
-- them, including the 0043 health-consent and body-measurement rules.
-- No policy changes.
-- Run AFTER 0047.
-- ============================================================================

begin;

alter table body_metrics add column hip_cm numeric(5, 2);

alter table body_metrics drop constraint body_metrics_has_a_value;
alter table body_metrics add constraint body_metrics_has_a_value check (
  weight_kg is not null or waist_cm is not null or hip_cm is not null or body_fat_pct is not null
);

comment on table body_metrics is
  'Member-logged weight/waist/hips/body fat %, each optional per row. Renamed from weigh_ins in 0017. Append-only — a correction is a new row, never an edit.';

alter table goals add column start_value numeric;

comment on column goals.start_value is
  'The member''s number for goals.metric when the goal was set — the "Start" on the Goals card. Null if they gave none.';

commit;
