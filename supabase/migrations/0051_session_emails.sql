-- ============================================================================
-- 0051_session_emails.sql
-- Session emails (Carl, 2026-10-04): booking confirmation, evening-before
-- reminder, and an instant email when a waitlist place is offered.
--
--   - email_type gets 'session_reminder' and 'waitlist_offer' (logged in
--     email_log so each is sent once). Booking confirmations are sent
--     straight from the booking action and aren't logged.
--   - Waitlist offers are made inside promote_waitlist(), called from many
--     places (cancel, decline, guest invites lapsing...). Rather than chase
--     every caller, a trigger fires whenever an entry becomes 'offered' and
--     calls the app's /api/webhooks/waitlist-offer via pg_net (async: it
--     goes after the transaction commits, and never if it rolls back).
--   - The webhook is authorised with the app's CRON_SECRET, read from
--     Supabase Vault — it is NOT in this file. One-off setup after running
--     this (SQL editor, paste the real value from Vercel):
--       select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
--     Until that secret exists the trigger does nothing (no errors).
--
-- No new tables; no RLS changes. The trigger function runs as its owner
-- and only reads the one vault secret.
-- Run AFTER 0050.
-- ============================================================================

alter type email_type add value if not exists 'session_reminder';
alter type email_type add value if not exists 'waitlist_offer';

create extension if not exists pg_net;

create or replace function notify_waitlist_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_secret is null then
    return new;
  end if;

  -- The production URL (permanent; see the canonical-host redirect in src/proxy.ts).
  perform net.http_post(
    url := 'https://fitnessblueprints.vercel.app/api/webhooks/waitlist-offer',
    body := jsonb_build_object('entry_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret)
  );
  return new;
end;
$$;

revoke execute on function notify_waitlist_offer() from public, anon, authenticated;

create trigger trg_waitlist_offer_email
  after update of status on waitlist_entries
  for each row
  when (new.status = 'offered' and old.status is distinct from 'offered')
  execute function notify_waitlist_offer();
