-- ============================================================================
-- 0057_unscored_segments.sql
-- "Not scored" sections (Carl/Guy walkthrough, 2026-10-05): Guy doesn't
-- want members logging warm-ups and cool-downs ("seconds at the couch
-- stretch") — only the main lift, accessories and conditioning. Each
-- section in the builder gets a "Not scored" tick; on the live screen an
-- unscored section is a plain list with no inputs.
--
-- Existing warm-up and cool-down sections become unscored (Guy's default);
-- everything else stays scored. Copied from template to session along with
-- the rest of the section, like label and default_rounds.
--
-- No new tables; the existing session_segments / template_segments
-- policies cover the new column (read: as before; write: owner only, 0024).
-- ============================================================================

alter table session_segments
  add column is_scored boolean not null default true;

alter table template_segments
  add column is_scored boolean not null default true;

comment on column session_segments.is_scored is
  'False = members don''t log this section (warm-up / cool-down); the live screen lists it without inputs.';
comment on column template_segments.is_scored is
  'Copied to session_segments.is_scored when the template is assigned.';

update session_segments set is_scored = false where type in ('warmup', 'cooldown');
update template_segments set is_scored = false where type in ('warmup', 'cooldown');
