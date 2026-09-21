-- ============================================================================
-- 0021_email_reminders.sql
-- Logs every reminder email sent by the daily cron
-- (src/app/api/cron/reminders/route.ts) — Sunday check-in nudge, 6-week
-- goal check-in due, and the quiet-member alert to the owner. The unique
-- constraint below is what makes the cron idempotent: safe to re-run
-- without double-sending if Vercel retries or the job overlaps.
-- ============================================================================

create type email_type as enum ('sunday_checkin_reminder', 'goal_checkin_due', 'coach_quiet_member_alert');

create table email_log (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles (id) on delete cascade,
  email_type email_type not null,
  -- An ISO week key (Sunday reminder), a goal id (check-in due), or
  -- "<quiet-member-id>:<week-key>" (quiet-member alert) — whatever makes
  -- one send-per-period unique for that email_type.
  reference_key text not null,
  sent_at timestamptz not null default now(),
  unique (recipient_id, email_type, reference_key)
);

comment on table email_log is
  'Append-only send log for the reminder cron, same append-only shape as credit_ledger. Exists to make the cron idempotent and give a debugging trail, not for members to read.';

create index idx_email_log_recipient on email_log (recipient_id, sent_at desc);

-- ----------------------------------------------------------------------------
-- RLS — owner can read for visibility/debugging; every write is
-- service-role only (the cron route uses the admin client), same posture
-- as credit_ledger (no client-role write policy at all).
-- ----------------------------------------------------------------------------
alter table email_log enable row level security;

create policy "owner reads email log"
  on email_log for select
  using (is_owner());
