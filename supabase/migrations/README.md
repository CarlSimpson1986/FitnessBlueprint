# Migrations

Run in order — the filenames are numbered deliberately, don't reorder.

| File | Purpose |
|---|---|
| `0001_init_core_schema.sql` | Every core table: profiles, memberships, sessions, bookings, waitlist, challenges, events |
| `0002_rls_policies.sql` | Row Level Security for every table in 0001. **A table isn't done until its RLS policy exists here.** |
| `0003_coach_ted_vectors.sql` | Coach Ted's knowledge base, self-learning Q&A cache, and conversation history |
| `0015_workout_content_and_logging.sql` | Structured Session -> Segment -> Exercise content + member-logged sets (`exercise_logs`) |
| `0016_goals.sql` | Member-created goals, set via the Coach Ted-branded wizard |
| `0017_body_metrics.sql` | Renames `weigh_ins` -> `body_metrics`, widens to weight/waist/body fat % |
| `0018_mark_self_attended.sql` | Lets a member self-report attendance when finishing a live-logged workout |
| `0019_workout_templates.sql` | Reusable named workout templates (`workout_templates`/`template_segments`/`template_exercises`), assigned onto the program calendar |
| `0020_exercise_sets.sql` | Per-set granularity (`session_exercise_sets`/`template_exercise_sets`) replacing the shared rounds/target/rest-per-exercise shape from 0015 |
| `0021_email_reminders.sql` | `email_log` — idempotency/send log for the daily reminders cron (Sunday check-in, goal check-in due, quiet-member alert) |
| `0024_owner_only_writes.sql` | Only the owner creates/edits classes, sessions, workouts, templates, challenges, events; coaches are view-only and mark attendance on their own sessions |
| `0025_no_booking_started_sessions.sql` | `book_session()` rejects classes that have already started (UK time) |
| `0026_goal_type_build_muscle.sql` | Adds `build_muscle` to `goal_type` for the goal wizard's Build muscle option |
| `0027_set_intensity.sql` | Per-set `intensity_type` (%1RM / RPE) + `intensity_value` on session and template sets |
| `0028_weekly_checkins.sql` | Sunday weekly check-in with Ted (`weekly_checkins`) + RLS: members own rows, coaches/owner read |
| `0029_ted_cache_curation.sql` | HNSW vector indexes (IVFFlat built on empty tables can miss matches) + owner insert/delete on Coach Ted's answer cache |
| `0040_stripe_checkout.sql` | Stripe product name -> plan mapping, 3 new plans (Hyrox only, 21-day starter, 6WP 1x), checkout-session idempotency, class-restricted plans enforced in `book_session`/`accept_booking_invite` |
| `0041_plan_weekly_limits.sql` | Hyrox only and the 21-day starter are 3 sessions a week |
| `0042_coach_permissions.sql` | Per-coach on/off for Today / Programme / Check-ins (`coach_permissions`, `staff_can_view()`); coach reads of check-ins, health data and bookings follow the switches. Drops the never-enforced `coach_access_level` |
| `0043_health_consent.sql` | Explicit health-info consent + body-measurements opt-out on `profiles` (`set_health_choices()`); members' health writes need a yes, staff stop seeing a member's health data when they say no |
| `0044_advisor_fixes.sql` | Security audit 2026-10-03: revoke anon/authenticated EXECUTE on `promote_waitlist`/`rls_auto_enable` (Supabase grants new functions to those roles directly, so `revoke from public` isn't enough); consent helpers only answer for self/staff; drop member direct-write policies on bookings and waitlist (RPCs only); events update WITH CHECK; `profiles.email` always synced from `auth.users` (Stripe matches on it) |
| `0045_helpers_not_for_anon.sql` | RLS helper functions (`auth_role`, `is_owner`, `is_coach_or_owner`, `staff_can_view`, consent helpers) no longer executable signed out. The remaining Advisor 0029 warnings (signed-in users can run the booking/waitlist/Ted RPCs and helpers) are by design |
| `0046_rls_performance.sql` | Performance Advisor fixes, same access: every policy merged to one per table/action (`"<table>: read"` etc., ORing the old ones), `to authenticated`, `(select auth.uid())`. Generated; each policy lists the old ones it replaces |
| `0047_session_notes.sql` | Coach post-session notes (tags + short text), one per member per session. Written by the owner or the coach taking the session; read like check-ins (Check-ins switch + health consent); members no longer read notes about them |

## Adding a new migration

```bash
supabase migration new descriptive_name
```

Rules, not suggestions:

1. **RLS goes in the same migration as the table**, or the very next one before anything else ships. Never leave a window where a table exists without policies.
2. **Never edit a migration that's already been applied to production.** Write a new one that alters/corrects it. Migrations are a append-only log, same as the credit ledger.
3. Every new table needs a one-line comment (`comment on table ... is '...'`) explaining what it's for if it's not obvious from the name.
4. Test locally first: `supabase db reset` replays every migration + seed from scratch.
