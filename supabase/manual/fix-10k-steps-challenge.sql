-- One-off data fix (not a migration). Run in the Supabase SQL editor.
-- The "10k Steps" challenge was created as an Attendance challenge, so the
-- app counted classes attended towards it. Steps aren't tracked in the
-- app, so it should be one Guy tracks himself (event_prep).
-- Shows the row it changed; 0 rows = already fixed or renamed.

update challenges
set type = 'event_prep'
where title ilike '10k steps%' and type = 'attendance'
returning id, title, type, starts_at, ends_at;
