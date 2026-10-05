-- ============================================================================
-- 0052_retire_5_pack.sql
-- The 5-session pack is no longer sold (Carl, 2026-10-05), so it comes out
-- of the owner's "Choose plan..." list on Members (which only shows
-- is_active plans).
--
-- Retired, not deleted: past memberships still point at it, and anyone
-- holding one keeps it. The Stripe webhook matches on stripe_product_name
-- and ignores is_active, but this plan has no Stripe product anyway.
--
-- The monthly plans (Unlimited / 2x / 1x per week) stay for now: they look
-- like the monthly continuation packages under generic names — waiting on
-- Guy to confirm what they're called before renaming or retiring them.
--
-- No new tables; no RLS changes ("membership_plans: change" is owner-only,
-- and this runs as the migration owner).
-- ============================================================================

update membership_plans set is_active = false where code = 'pack_5';
