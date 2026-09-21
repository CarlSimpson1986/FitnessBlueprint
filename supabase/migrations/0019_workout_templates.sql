-- ============================================================================
-- 0019_workout_templates.sql
-- Reusable, named workout templates (e.g. "Group Coaching 1") that a coach
-- builds once and assigns onto specific days in the program calendar.
-- Structurally identical to session_segments/session_exercises (0015) but
-- keyed to a template rather than a scheduled session — assigning a
-- template to a session COPIES its content into that session's own
-- session_segments/session_exercises rows (app-layer, see
-- src/app/admin/program-calendar/actions.ts), it is not a live reference.
-- Editing a template later never retroactively changes a session it was
-- already assigned to.
--
-- Deliberately named workout_templates, not session_templates (0001) —
-- session_templates is the class-TYPE concept ("Circuits", "Hyrox"); this
-- is reusable workout CONTENT. Different concept, easy to confuse by name.
--
-- RLS ships in this same migration, per supabase/migrations/README.md.
-- ============================================================================

create table workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

comment on table workout_templates is
  'A named, reusable workout (segments + exercises) a coach builds once and assigns onto the program calendar. Not session_templates (0001), which is the class-type concept.';

create table template_segments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references workout_templates (id) on delete cascade,
  type segment_type not null,
  label text,
  default_rounds integer,
  sort_order integer not null
);

create index idx_template_segments_template on template_segments (template_id, sort_order);

create table template_exercises (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references template_segments (id) on delete cascade,
  name text not null,
  rounds integer,
  metric_type exercise_metric_type not null,
  target text,
  rest_seconds integer,
  video_url text,
  sort_order integer not null
);

create index idx_template_exercises_segment on template_exercises (segment_id, sort_order);

-- ----------------------------------------------------------------------------
-- RLS — same authenticated-read / coach-owner-manage pattern as
-- session_segments/session_exercises (0015).
-- ----------------------------------------------------------------------------
alter table workout_templates enable row level security;
alter table template_segments enable row level security;
alter table template_exercises enable row level security;

create policy "authenticated users read workout templates"
  on workout_templates for select
  to authenticated
  using (true);

create policy "coaches and owner manage workout templates"
  on workout_templates for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

create policy "authenticated users read template segments"
  on template_segments for select
  to authenticated
  using (true);

create policy "coaches and owner manage template segments"
  on template_segments for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());

create policy "authenticated users read template exercises"
  on template_exercises for select
  to authenticated
  using (true);

create policy "coaches and owner manage template exercises"
  on template_exercises for all
  using (is_coach_or_owner())
  with check (is_coach_or_owner());
