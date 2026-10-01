-- ============================================================================
-- 0039_ted_usage_limits.sql
-- Coach Ted's daily limits, made race-proof (OWASP LLM10, unbounded
-- consumption). The old check counted *saved* conversations, which are
-- only written once an answer finishes — so many questions fired at once
-- all passed, and failed answers never counted.
--
-- Now /api/coach-ted claims a slot BEFORE generating, through
-- claim_ted_question(), which counts and records in one step under a
-- lock. Limits live here, not in the caller, so calling the function
-- directly can't raise them:
--   - 20 questions per member per rolling 24h (unchanged),
--   - 300 per rolling 24h across the whole gym — a cost backstop if
--     accounts are ever created in bulk (signup is open).
-- A claimed slot counts even if the answer then fails.
-- ============================================================================

create table coach_ted_usage (
  id bigint generated always as identity primary key,
  member_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table coach_ted_usage is
  'One row per Coach Ted question asked, written by claim_ted_question() before the answer is generated. Drives the per-member and gym-wide daily limits.';

create index idx_ted_usage_member on coach_ted_usage (member_id, created_at desc);
create index idx_ted_usage_created on coach_ted_usage (created_at desc);

-- No member policies: the only way in is claim_ted_question(). The owner
-- can read usage (e.g. to spot abuse).
alter table coach_ted_usage enable row level security;

create policy "owner reads ted usage"
  on coach_ted_usage for select
  using (is_owner());

create or replace function claim_ted_question()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_limit constant int := 20;
  v_gym_limit constant int := 300;
  v_mine int;
  v_all int;
begin
  if v_uid is null then
    return 'not_signed_in';
  end if;

  -- One claim at a time across the gym, so two simultaneous questions
  -- can't both see "19 used". Held only for this transaction.
  perform pg_advisory_xact_lock(hashtext('claim_ted_question'));

  select count(*) into v_mine
  from coach_ted_usage
  where member_id = v_uid and created_at > now() - interval '24 hours';
  if v_mine >= v_member_limit then
    return 'member_limit';
  end if;

  select count(*) into v_all
  from coach_ted_usage
  where created_at > now() - interval '24 hours';
  if v_all >= v_gym_limit then
    return 'gym_limit';
  end if;

  insert into coach_ted_usage (member_id) values (v_uid);
  return 'ok';
end;
$$;

revoke execute on function claim_ted_question() from public, anon;
grant execute on function claim_ted_question() to authenticated;
