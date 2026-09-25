-- ============================================================================
-- 0034_calendar_feeds.sql
-- Private calendar subscription links (iCal/.ics) — a member's own
-- bookings, or for the owner every session plus coach time off. Calendar
-- apps (Google, Apple, Outlook) can't sign in, so the link carries a long
-- random token instead; /api/calendar/[token] looks it up with the admin
-- client, like a webhook would. One token per person; "Reset link"
-- replaces it, which kills the old URL.
-- ============================================================================

create table calendar_feed_tokens (
  profile_id uuid primary key references profiles (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

comment on table calendar_feed_tokens is
  'Secret token behind each person''s calendar subscription URL (/api/calendar/<token>). Reset = replace the row.';

alter table calendar_feed_tokens enable row level security;

create policy "people manage their own calendar feed token"
  on calendar_feed_tokens for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);
