-- ============================================================================
-- 0027_set_intensity.sql
-- Per-set intensity the owner sets in the workout builder: either % of
-- 1RM or RPE, as a structured field next to the free-text target (which
-- keeps reps/time/etc). Previously intensity could only be typed into the
-- target text ("70% 1RM x5") and parsed back out. Applies to both scheduled
-- session sets and template sets. Existing RLS on both tables unchanged
-- (owner writes per 0024, authenticated read).
-- ============================================================================

alter table session_exercise_sets
  add column intensity_type text check (intensity_type in ('percent_1rm', 'rpe')),
  add column intensity_value numeric(4, 1),
  add constraint session_exercise_sets_intensity_pair check (
    (intensity_type is null) = (intensity_value is null)
    and (
      intensity_type is null
      or (intensity_type = 'percent_1rm' and intensity_value > 0 and intensity_value <= 100)
      or (intensity_type = 'rpe' and intensity_value >= 1 and intensity_value <= 10)
    )
  );

alter table template_exercise_sets
  add column intensity_type text check (intensity_type in ('percent_1rm', 'rpe')),
  add column intensity_value numeric(4, 1),
  add constraint template_exercise_sets_intensity_pair check (
    (intensity_type is null) = (intensity_value is null)
    and (
      intensity_type is null
      or (intensity_type = 'percent_1rm' and intensity_value > 0 and intensity_value <= 100)
      or (intensity_type = 'rpe' and intensity_value >= 1 and intensity_value <= 10)
    )
  );
