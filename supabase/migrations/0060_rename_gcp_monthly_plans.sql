-- ============================================================================
-- 0060_rename_gcp_monthly_plans.sql
-- The monthly continuation packages are called GCP-1 / GCP-2 / GCP-Unlimited
-- (confirmed by Guy, via Carl, 2026-10-06). Renames the three plans 0052 left
-- waiting under generic names. Weekly limits are unchanged (1, 2, none).
--
-- Display names only. stripe_product_name is untouched: the webhook still
-- matches Guy's Stripe products "GCP - 1 per week" / "GCP - 2 per week" /
-- "GCP - UNLIMITED". If Guy renames those in Stripe, update that column too.
--
-- No new tables; no RLS changes ("membership_plans: change" is owner-only,
-- and this runs as the migration owner).
-- ============================================================================

update membership_plans set name = v.name
from (values
  ('1x_week',   'GCP-1'),
  ('2x_week',   'GCP-2'),
  ('unlimited', 'GCP-Unlimited')
) as v(code, name)
where membership_plans.code = v.code;
