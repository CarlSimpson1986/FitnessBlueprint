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

## Adding a new migration

```bash
supabase migration new descriptive_name
```

Rules, not suggestions:

1. **RLS goes in the same migration as the table**, or the very next one before anything else ships. Never leave a window where a table exists without policies.
2. **Never edit a migration that's already been applied to production.** Write a new one that alters/corrects it. Migrations are a append-only log, same as the credit ledger.
3. Every new table needs a one-line comment (`comment on table ... is '...'`) explaining what it's for if it's not obvious from the name.
4. Test locally first: `supabase db reset` replays every migration + seed from scratch.
