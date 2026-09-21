-- ============================================================================
-- 0017_body_metrics.sql
-- Renames weigh_ins -> body_metrics and widens it to weight/waist/body fat %,
-- each optional per submission ("log whatever you've got" — see
-- fitness-blueprint-build-spec.md handoff). Renamed rather than just adding
-- columns because the table is no longer weight-only, and the spec calls
-- this feature "Body metrics" throughout. Still append-only like
-- credit_ledger — a correction is a new row, never an edit.
-- ============================================================================

alter table weigh_ins rename to body_metrics;
alter index idx_weigh_ins_member rename to idx_body_metrics_member;

alter table body_metrics alter column weight_kg drop not null;
alter table body_metrics add column waist_cm numeric(5, 2);
alter table body_metrics add column body_fat_pct numeric(4, 2);
alter table body_metrics add constraint body_metrics_has_a_value check (
  weight_kg is not null or waist_cm is not null or body_fat_pct is not null
);

comment on table body_metrics is
  'Member-logged weight/waist/body fat %, each optional per row. Renamed from weigh_ins in 0017 when the Progress-tab metrics card widened beyond weight-only. Append-only like credit_ledger — a correction is a new row, never an edit.';

-- Re-label the existing policies (same using/with check clauses — policies
-- are tied to the table's OID, not its name, so the rename above didn't
-- touch these; this just keeps the labels honest).
drop policy "members read own weigh-ins" on body_metrics;
create policy "members read own body metrics"
  on body_metrics for select
  using (auth.uid() = member_id);

drop policy "coaches and owner read all weigh-ins" on body_metrics;
create policy "coaches and owner read all body metrics"
  on body_metrics for select
  using (is_coach_or_owner());

drop policy "members log own weigh-ins" on body_metrics;
create policy "members log own body metrics"
  on body_metrics for insert
  with check (auth.uid() = member_id);
