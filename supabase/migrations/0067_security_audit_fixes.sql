-- ============================================================================
-- 0067_security_audit_fixes.sql
-- Fixes from the 2026-10-24 security audit.
--
-- 1. Member-posted events (audit #3). "events: create" / "events: change"
--    let any signed-in account write a member event straight through the
--    API with any registration_url — the "Register" link other members
--    see, i.e. a phishing link — and is_paid. The app's own form never
--    sends either. Now a member event has no link and isn't paid, and only
--    a member with an active membership can post one. Same one-policy-per-
--    action shape as 0046 (drop and recreate, ORed conditions).
--
-- 2. Length caps (audit #3, #9) on member-typed text: events, and the
--    guest invite answers (respond_guest_invite is open to anon, 0050).
--    NOT VALID: enforced on new and changed rows, existing rows untouched.
--
-- 3. password_resets (audit #4): every owner "Reset password" is recorded
--    — whose, by whom, when. Written only by the server action with the
--    service role (no insert policy); the owner reads it.
--
-- Run AFTER 0066.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Member events
-- ----------------------------------------------------------------------------
drop policy "events: create" on events;
create policy "events: create"
  on events for insert
  to authenticated
  with check (
    (
      (select auth.uid()) = created_by
      and event_type = 'member_posted'
      and registration_url is null
      and not is_paid
      and exists (
        select 1 from member_memberships mm
        where mm.member_id = (select auth.uid()) and mm.status = 'active'
      )
    )
    or (is_owner() and event_type = 'gym')
  );

drop policy "events: change" on events;
create policy "events: change"
  on events for update
  to authenticated
  using (
    (select auth.uid()) = created_by or is_owner()
  )
  with check (
    is_owner()
    or (
      (select auth.uid()) = created_by
      and event_type = 'member_posted'
      and registration_url is null
      and not is_paid
    )
  );

-- ----------------------------------------------------------------------------
-- 2. Length caps
-- ----------------------------------------------------------------------------
alter table events
  add constraint events_title_length check (char_length(title) <= 120) not valid,
  add constraint events_description_length check (char_length(description) <= 2000) not valid,
  add constraint events_location_length check (char_length(location) <= 200) not valid,
  add constraint events_registration_url_https check (registration_url is null or registration_url ~ '^https://') not valid;

alter table guest_details
  add constraint guest_details_phone_length check (char_length(phone) <= 30) not valid,
  add constraint guest_details_health_notes_length check (char_length(health_notes) <= 2000) not valid;

-- ----------------------------------------------------------------------------
-- 3. password_resets
-- ----------------------------------------------------------------------------
create table password_resets (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references profiles (id) on delete cascade,
  reset_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table password_resets is
  'Audit trail of owner "Reset password" actions (who, by whom, when). Written by the server action with the service role only.';

create index idx_password_resets_person on password_resets (person_id, created_at desc);

alter table password_resets enable row level security;

create policy "password_resets: read"
  on password_resets for select
  to authenticated
  using (
    is_owner()
  );
