-- ============================================================================
-- 0001_init_core_schema.sql
-- Fitness Blueprint — core tables
--
-- Every table in this migration gets RLS enabled in 0002. That's not a
-- convention, it's a rule: a table that exists without RLS policies is
-- readable/writable by anyone with the anon key by default in Postgres
-- unless RLS is turned on, so we enable it in the same PR that creates
-- the table (see 0002) and never merge one without the other.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- profiles — one row per person, extends auth.users
-- ----------------------------------------------------------------------------
create type member_role as enum ('member', 'coach', 'owner');
create type coach_access_level as enum ('full', 'cover_and_kids_only');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role member_role not null default 'member',
  coach_access_level coach_access_level, -- null for members/owner; set for coaches
  full_name text not null,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is
  'One row per person. Tommy is the only coach with coach_access_level = cover_and_kids_only; all other coaches are full.';

-- ----------------------------------------------------------------------------
-- membership_plans — the 7 confirmed products (reference data, not per-member)
-- ----------------------------------------------------------------------------
create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- e.g. 'unlimited', '2x_week', '6wk_unlimited'
  name text not null,
  price_pence integer not null check (price_pence >= 0),
  billing_type text not null check (billing_type in ('recurring', 'one_off')),
  sessions_per_week integer, -- null = unlimited
  credit_pack_size integer, -- for drop-in / 5-pack style products
  programme_length_days integer, -- for the 6-week programme products
  is_active boolean not null default true
);

-- ----------------------------------------------------------------------------
-- member_memberships — a member's actual subscription/pack instance
-- ----------------------------------------------------------------------------
create type membership_status as enum ('active', 'paused', 'cancelled', 'expired');

create table member_memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  plan_id uuid not null references membership_plans (id),
  status membership_status not null default 'active',
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  stripe_subscription_id text,
  gocardless_subscription_id text,
  created_at timestamptz not null default now()
);

create index idx_member_memberships_member on member_memberships (member_id);

-- ----------------------------------------------------------------------------
-- credit_ledger — append-only. Balance is derived, never stored/mutated
-- directly, so there's always an audit trail for "why does Sarah have
-- 3 credits". Monthly reset is a scheduled job that inserts adjustment
-- rows rather than overwriting a balance column.
-- ----------------------------------------------------------------------------
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  delta integer not null, -- positive = credit added, negative = credit used
  reason text not null, -- 'monthly_reset' | 'booking' | 'cancellation_refund' | 'manual_adjustment' | 'signup_bonus'
  related_booking_id uuid, -- fk added after bookings table exists (see below)
  created_by uuid references profiles (id), -- null for system-generated rows
  created_at timestamptz not null default now()
);

create index idx_credit_ledger_member on credit_ledger (member_id, created_at desc);

comment on table credit_ledger is
  'Append-only. Current balance = sum(delta) for a member. Never UPDATE or DELETE a row — insert a correcting entry instead.';

-- ----------------------------------------------------------------------------
-- session_templates — GCP, Circuits, Mobilise, Strength, Hyrox, FNL
-- ----------------------------------------------------------------------------
create table session_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  default_duration_minutes integer not null default 60,
  default_capacity integer not null default 12,
  is_active boolean not null default true
);

-- ----------------------------------------------------------------------------
-- sessions — actual timetable occurrences
-- ----------------------------------------------------------------------------
create type session_status as enum ('scheduled', 'cancelled', 'completed');

create table sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references session_templates (id),
  coach_id uuid not null references profiles (id),
  session_date date not null,
  start_time time not null,
  duration_minutes integer not null,
  capacity integer not null,
  status session_status not null default 'scheduled',
  created_at timestamptz not null default now(),

  constraint valid_coach check (true) -- enforced properly via RLS + app logic:
  -- coaches with coach_access_level = 'cover_and_kids_only' should only be
  -- assigned to cover/kids sessions. Enforce in application logic and revisit
  -- as a trigger once the kids programme (v2) ships.
);

create index idx_sessions_date on sessions (session_date);
create index idx_sessions_coach on sessions (coach_id, session_date);

-- ----------------------------------------------------------------------------
-- session_plans — text-based programming, supports bulk block upload
-- ----------------------------------------------------------------------------
create table session_plans (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  block_id uuid, -- groups plans uploaded together as one 6-8 week block
  plan_text text not null,
  is_published boolean not null default false, -- controls "What's On Today" visibility
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_session_plans_session on session_plans (session_id);
create index idx_session_plans_block on session_plans (block_id) where block_id is not null;

-- ----------------------------------------------------------------------------
-- bookings
-- ----------------------------------------------------------------------------
create type booking_status as enum ('booked', 'cancelled', 'attended', 'no_show', 'excused');

create table bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  status booking_status not null default 'booked',
  booked_at timestamptz not null default now(),
  cancelled_at timestamptz,
  credit_ledger_id uuid references credit_ledger (id),
  unique (session_id, member_id) -- one booking per member per session
);

create index idx_bookings_member on bookings (member_id, booked_at desc);
create index idx_bookings_session on bookings (session_id);

alter table credit_ledger
  add constraint fk_credit_ledger_booking
  foreign key (related_booking_id) references bookings (id);

-- ----------------------------------------------------------------------------
-- waitlist_entries — supports buddy waitlist + timed acceptance offers
-- ----------------------------------------------------------------------------
create type waitlist_status as enum ('waiting', 'offered', 'accepted', 'expired', 'declined');

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  buddy_member_id uuid references profiles (id), -- "only promote us together"
  position integer not null,
  status waitlist_status not null default 'waiting',
  offered_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);

create index idx_waitlist_session on waitlist_entries (session_id, position);

-- ----------------------------------------------------------------------------
-- readiness_checkins
-- ----------------------------------------------------------------------------
create table readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles (id) on delete cascade,
  session_id uuid not null references sessions (id) on delete cascade,
  feeling text not null check (feeling in ('great', 'okay', 'rough')),
  pain_area text,
  sleep_quality text check (sleep_quality in ('good', 'average', 'poor')),
  submitted_at timestamptz not null default now(),
  unique (member_id, session_id)
);

-- ----------------------------------------------------------------------------
-- session_notes — coach notes, contains health-adjacent info (injuries etc.)
-- ----------------------------------------------------------------------------
create table session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  coach_id uuid not null references profiles (id),
  tags text[] not null default '{}',
  note_text text,
  created_at timestamptz not null default now()
);

create index idx_session_notes_member on session_notes (member_id, created_at desc);

-- ----------------------------------------------------------------------------
-- session_feedback — private to owner only, per confirmed decision
-- ----------------------------------------------------------------------------
create table session_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  class_rating smallint not null check (class_rating between 1 and 5),
  effort_rating smallint not null check (effort_rating between 1 and 5),
  experience_rating smallint not null check (experience_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (session_id, member_id)
);

-- ----------------------------------------------------------------------------
-- challenges
-- ----------------------------------------------------------------------------
create type challenge_type as enum ('attendance', 'habit', 'event_prep', 'team');

create table challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type challenge_type not null,
  is_open boolean not null default true, -- true = self opt-in, false = coach-assigned
  target_value integer not null,
  starts_at date not null,
  ends_at date not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  progress_value integer not null default 0,
  joined_at timestamptz not null default now(),
  unique (challenge_id, member_id)
);

-- ----------------------------------------------------------------------------
-- events — gym events (Engine Race etc.) and member-posted events
-- ----------------------------------------------------------------------------
create type event_type as enum ('gym', 'member_posted');

create table events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type event_type not null,
  event_date date,
  location text,
  registration_url text,
  is_paid boolean not null default false,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table event_interests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  member_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, member_id)
);

-- ----------------------------------------------------------------------------
-- updated_at trigger — keep this boring and reused everywhere
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_session_plans_updated_at
  before update on session_plans
  for each row execute function set_updated_at();
