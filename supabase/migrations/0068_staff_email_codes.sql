-- ============================================================================
-- 0068_staff_email_codes.sql
-- Emailed code as a backup second step for staff, alongside the
-- authenticator app from 0038, which stays the main way. Three coaches
-- couldn't get authenticator codes accepted (2026-10-22/23); anyone stuck
-- on setup or without their phone can now have a 6-digit code emailed.
--
-- One row per sign-in session (auth.sessions). The server action makes a
-- random code, stores only its SHA-256 hash here, and emails the code
-- (src/app/login/two-factor/actions.ts). Entering it sets verified_at.
-- The row is deleted with the session (sign-out, expiry) where the
-- project allows the foreign key, and a code only ever counts for the
-- session it was sent to.
--
-- staff_session_verified() (0038) — which every staff RLS policy goes
-- through via is_coach_or_owner() / is_owner() — now also accepts a
-- session with a verified emailed code. Still enforced in the database:
-- a stolen password alone gets nothing beyond the person's own profile.
-- ============================================================================

create table staff_signin_codes (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now(),
  verified_at timestamptz
);

comment on table staff_signin_codes is
  'Emailed sign-in codes for staff (one per auth session; hash only). Written and read by the server action with the service role only — no client policies.';

-- Delete the row with its session. If this project doesn't allow a
-- foreign key into auth.sessions, skip it: a leftover row is harmless,
-- since every sign-in gets a new session_id and needs a new code.
do $$
begin
  alter table staff_signin_codes
    add constraint staff_signin_codes_session_fk
    foreign key (session_id) references auth.sessions (id) on delete cascade;
exception when insufficient_privilege then
  raise notice 'No foreign key to auth.sessions (insufficient privilege) — rows stay after sign-out.';
end;
$$;

create index idx_staff_signin_codes_user on staff_signin_codes (user_id, sent_at desc);

-- No policies: nobody signed in can read or write codes, not even their
-- own. Only the server (service role) and staff_session_verified() below
-- (security definer) touch this table.
alter table staff_signin_codes enable row level security;

-- Was security invoker; now definer so it can read staff_signin_codes,
-- which has no policies.
create or replace function staff_session_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or (auth.jwt() -> 'app_metadata' ->> 'test_account') is not null
      or exists (
        select 1
        from staff_signin_codes c
        where c.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
          and c.user_id = (select auth.uid())
          and c.verified_at is not null
      );
$$;

comment on function staff_session_verified() is
  'True when this session passed two-factor: an authenticator code (aal2), an emailed code (staff_signin_codes, 0068), or it is an owner-only View-as test account. Required by is_coach_or_owner() / is_owner().';

-- The app asks this directly (src/lib/auth.ts) for signed-in staff; not
-- for signed-out callers, same as the other helpers in 0045.
revoke execute on function staff_session_verified() from anon;
