-- ============================================================================
-- Function audit (read-only). Not a migration — run by hand in the Supabase
-- SQL editor. Copy from this file, not from the chat. Changes nothing.
--
-- For every function the migrations define, compares the live body with
-- the LATEST migration's version (by md5 fingerprint). Generated
-- 2026-10-05 from supabase/migrations/ (0001_init_core_schema.sql .. 0058_ted_rating_reason.sql).
--
-- status:
--   ok        live function matches the latest migration
--   DIFFERENT live function is an older (or hand-edited) version — the
--             migration in "expected_from" probably never ran
--   MISSING   function doesn't exist live at all
-- Only problems are listed; no rows = everything matches.
-- ============================================================================

with expected(name, arg_count, expected_from, body_md5) as (values
  ('accept_booking_invite', 1, '0040_stripe_checkout.sql', 'b3f5886eb740c420309fabd5b84d80c6'),
  ('accept_waitlist_offer', 1, '0010_waitlist.sql', '9230bb8d3597452467f4b45e9195602f'),
  ('auth_role', 0, '0002_rls_policies.sql', '9443df2104374cf0d4671d6344e23d4a'),
  ('book_session', 1, '0050_guest_invites.sql', 'b952df0172ea55cc287c93f07b4f7047'),
  ('can_write_session_note', 2, '0047_session_notes.sql', '17944a57c3baa27de125c703cdf2348f'),
  ('cancel_booking', 1, '0054_restore_cancellation_window.sql', 'a77c65e737c50a53042246561a8b1fe2'),
  ('cancel_guest_invite', 1, '0050_guest_invites.sql', 'ddabdfaa26a8309ea83c5324bc777d4f'),
  ('claim_ted_question', 0, '0039_ted_usage_limits.sql', '048cffaababff7ccb0cec1dff79c6cd4'),
  ('decline_booking_invite', 1, '0014_buddy_booking.sql', 'ed15c883592e5f8fd5368bb26cf22d7c'),
  ('excuse_booking', 1, '0056_excuse_booking.sql', '10039a986311af01266016fb24bf8541'),
  ('get_guest_invite', 1, '0050_guest_invites.sql', '50a6d5c71412a37f80a9f6a8a402196d'),
  ('guard_booking_direct_update', 0, '0044_advisor_fixes.sql', '854bbc60e06f417a038a1e5bf1e7a284'),
  ('guest_passes_left', 0, '0050_guest_invites.sql', '054ed0bc7abda61ea182d2b5eb2e4f76'),
  ('guest_spots_held', 1, '0050_guest_invites.sql', '3f4dc37774667c42886c81bb46ca3694'),
  ('has_health_consent', 1, '0044_advisor_fixes.sql', 'c2cc182b81bbe94861a6c70b47dfa75e'),
  ('invite_buddy', 2, '0014_buddy_booking.sql', '0d29e859d67007a787a8c0b31c648a18'),
  ('invite_guest', 3, '0050_guest_invites.sql', 'd6a3657003a4652b39927f1296d628cc'),
  ('is_coach_or_owner', 0, '0038_staff_two_factor.sql', 'd8b79e98d5685e42e2e56f00796af6f3'),
  ('is_owner', 0, '0038_staff_two_factor.sql', '49f936dc0be8c42c49decece0b36f466'),
  ('join_waitlist', 2, '0055_waitlist_needs_membership.sql', 'cb835746139538ea2d425843e1939050'),
  ('leave_waitlist', 1, '0010_waitlist.sql', 'dd8ebafb9864ec480c655e4878b60ece'),
  ('list_coach_names', 0, '0011_coach_names_for_members.sql', '5fc4b4435a31a00c18aee93a098c3772'),
  ('lookup_member_by_email', 1, '0010_waitlist.sql', '0a444f3d16306b2499180d862b1d9f67'),
  ('mark_guest_joined', 0, '0050_guest_invites.sql', '0745f0dc2b65f58278213093b58385eb'),
  ('mark_self_attended', 1, '0018_mark_self_attended.sql', 'b60d3becc65707f63ae95dada0510f7c'),
  ('match_knowledge_base', 2, '0003_coach_ted_vectors.sql', '662ab7a8dc9618f52eb39b07bb1cf293'),
  ('match_qa_cache', 3, '0003_coach_ted_vectors.sql', '64a1300defbb42463c7e9f8c5108461f'),
  ('notify_waitlist_offer', 0, '0051_session_emails.sql', '592fbb5e0b33ce0c637cd10d9ff590ed'),
  ('promote_waitlist', 1, '0050_guest_invites.sql', 'd025867269312de9769f965f2ad47dc2'),
  ('rate_ted_answer', 3, '0058_ted_rating_reason.sql', '9b72ca4f06c0870a82b883772fb4af7d'),
  ('respond_guest_invite', 6, '0050_guest_invites.sql', '919e6fedd02fb541d39334ab6459d62a'),
  ('session_spots_taken', 1, '0050_guest_invites.sql', '9c9dbf6f6fac6528e1c5c9b52f3a645c'),
  ('set_health_choices', 2, '0043_health_consent.sql', '6d0987c142f9a2761a5bf4b19c3b213a'),
  ('set_updated_at', 0, '0001_init_core_schema.sql', '9b1889f56258bf9d6554213c05019c76'),
  ('staff_can_view', 1, '0042_coach_permissions.sql', '9da75c7b49c4492c1285ae4414696cd1'),
  ('staff_session_verified', 0, '0038_staff_two_factor.sql', 'e1548178a4c58745e4d274d7195d9732'),
  ('sync_profile_email', 0, '0044_advisor_fixes.sql', '4bfd7a87e140e810b6b842e01b9d5339'),
  ('tracks_body_metrics', 1, '0044_advisor_fixes.sql', '25a0d89842993105520ad82cf0e14de9'),
  ('withdraw_booking_invite', 1, '0014_buddy_booking.sql', 'd52bcb6c52d105d282a7ab9203c3f625')
),
live as (
  select p.proname as name, p.pronargs as arg_count, md5(replace(p.prosrc, chr(13), '')) as body_md5
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select e.name, e.arg_count, e.expected_from,
       case when l.name is null then 'MISSING' else 'DIFFERENT' end as status
from expected e
left join live l on l.name = e.name and l.arg_count = e.arg_count
where l.body_md5 is distinct from e.body_md5
order by e.expected_from, e.name;
