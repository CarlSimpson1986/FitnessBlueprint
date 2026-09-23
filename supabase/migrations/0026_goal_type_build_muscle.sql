-- ============================================================================
-- 0026_goal_type_build_muscle.sql
-- The goal wizard now separates "Build muscle" (bodyweight/body-fat
-- targets at evidence-based gain rates, see src/lib/goal-guidance.ts) from
-- "Get stronger" (a lift the member names themselves). goals.type needs
-- the new enum value. Existing RLS on goals is unchanged.
-- ============================================================================

alter type goal_type add value if not exists 'build_muscle';
