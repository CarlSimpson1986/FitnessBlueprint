-- ============================================================================
-- 0037_programme_followups.sql
-- Whether the owner has had the "what next?" conversation with someone on
-- a fixed-length programme (6-week, later 21-day), per the spec: "Flag
-- members in their final week who haven't discussed continuing."
--
-- One row per programme membership (member_memberships.id), so a member
-- who does the programme twice gets a fresh status the second time. No
-- row = not spoken to yet. Shown and edited on /owner/conversions; the
-- Monday digest email lists who still needs a conversation or whose
-- follow-up date has arrived.
--
-- Owner-only, read and write — same as the conversions page itself. Per
-- CLAUDE.md, only the owner creates or edits anything; coaches get no
-- policy here at all.
-- ============================================================================

create table programme_followups (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null unique references member_memberships (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  status text not null check (status in ('staying', 'not_now', 'follow_up')),
  follow_up_on date,
  note text,
  updated_by uuid references profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (status <> 'follow_up' or follow_up_on is not null)
);

comment on table programme_followups is
  'Owner''s note on the "what next?" chat with a programme member (6-week etc): staying / not now / follow up on a date. No row = not spoken to yet.';

create index idx_programme_followups_member on programme_followups (member_id);

alter table programme_followups enable row level security;

create policy "owner reads programme followups"
  on programme_followups for select
  using (is_owner());

create policy "owner inserts programme followups"
  on programme_followups for insert
  with check (is_owner());

create policy "owner updates programme followups"
  on programme_followups for update
  using (is_owner())
  with check (is_owner());

create policy "owner deletes programme followups"
  on programme_followups for delete
  using (is_owner());
