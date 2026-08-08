-- ============================================================================
-- seed.sql
-- Reference data only — no member/personal data. Safe to run in any
-- environment (local dev, staging). Matches the confirmed pricing from
-- the Fitness Blueprint spec, August 2026.
-- ============================================================================

insert into membership_plans (code, name, price_pence, billing_type, sessions_per_week, credit_pack_size, programme_length_days) values
  ('unlimited',       'Unlimited',                 16000, 'recurring', null, null, null),
  ('2x_week',         '2x per week',                12400, 'recurring', 2,    null, null),
  ('1x_week',         '1x per week',                 7000, 'recurring', 1,    null, null),
  ('drop_in',         'Drop-in',                     2000, 'one_off',   null, 1,    null),
  ('pack_5',          '5-session pack',              8000, 'one_off',   null, 5,    null),
  ('6wk_2x',          '6-Week Programme (2x/week)', 18500, 'one_off',   2,    null, 42),
  ('6wk_unlimited',   '6-Week Programme (Unlimited)', 24000, 'one_off', null, null, 42)
on conflict (code) do nothing;

insert into session_templates (code, name, description, default_duration_minutes, default_capacity) values
  ('gcp',       'GCP',                'General Conditioning Programme — the core small-group format', 60, 12),
  ('circuits',  'Circuits',           'Station-based conditioning circuit',                            45, 12),
  ('mobilise',  'Mobilise',           'Mobility and recovery-focused session',                          45, 12),
  ('strength',  'Strength',           'Barbell-focused strength session',                               60, 10),
  ('hyrox',     'Hyrox',              'Hyrox-style functional fitness racing prep',                     60, 12),
  ('fnl',       'Friday Night Lights','Community conditioning session to close the week',               60, 16)
on conflict (code) do nothing;
