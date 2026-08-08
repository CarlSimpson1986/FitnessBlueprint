# Migrations

Run in order — the filenames are numbered deliberately, don't reorder.

| File | Purpose |
|---|---|
| `0001_init_core_schema.sql` | Every core table: profiles, memberships, sessions, bookings, waitlist, challenges, events |
| `0002_rls_policies.sql` | Row Level Security for every table in 0001. **A table isn't done until its RLS policy exists here.** |
| `0003_coach_ted_vectors.sql` | Coach Ted's knowledge base, self-learning Q&A cache, and conversation history |

## Adding a new migration

```bash
supabase migration new descriptive_name
```

Rules, not suggestions:

1. **RLS goes in the same migration as the table**, or the very next one before anything else ships. Never leave a window where a table exists without policies.
2. **Never edit a migration that's already been applied to production.** Write a new one that alters/corrects it. Migrations are a append-only log, same as the credit ledger.
3. Every new table needs a one-line comment (`comment on table ... is '...'`) explaining what it's for if it's not obvious from the name.
4. Test locally first: `supabase db reset` replays every migration + seed from scratch.
