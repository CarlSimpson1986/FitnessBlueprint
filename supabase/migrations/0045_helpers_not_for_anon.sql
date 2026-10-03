-- ============================================================================
-- 0045_helpers_not_for_anon.sql
-- The RLS helper functions were callable signed out (Security Advisor lint
-- 0028). Harmless — signed out they all answer "no" — but nothing signed
-- out needs them, so take them away from anon. Signed-in users keep them:
-- the RLS policies call them as the querying user, so authenticated must be
-- able to execute them (that's why lint 0029 still lists them; expected).
--
-- Side effect: a signed-out query against a table whose policies call one
-- of these now gets "permission denied" instead of an empty result. The
-- app never queries tables signed out (login/signup/privacy don't, and
-- /auth/* only reads after the session is set), so nothing changes for it.
-- ============================================================================

revoke execute on function auth_role() from public, anon;
revoke execute on function is_owner() from public, anon;
revoke execute on function is_coach_or_owner() from public, anon;
revoke execute on function staff_can_view(text) from public, anon;
revoke execute on function has_health_consent(uuid) from public, anon;
revoke execute on function tracks_body_metrics(uuid) from public, anon;

grant execute on function auth_role() to authenticated;
grant execute on function is_owner() to authenticated;
grant execute on function is_coach_or_owner() to authenticated;
grant execute on function staff_can_view(text) to authenticated;
grant execute on function has_health_consent(uuid) to authenticated;
grant execute on function tracks_body_metrics(uuid) to authenticated;
