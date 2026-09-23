# Fitness Blueprint — CLAUDE.md

PWA replacing Virtuagym for a single-site group PT gym. Next.js (App
Router) + Supabase + Vercel. Full product spec lives in the shared
Google Doc — this file is build rules only, not feature context.

## Stack facts

- Next.js App Router, TypeScript strict mode, Tailwind. No `pages/` dir.
- Supabase: Postgres + Auth + Realtime + Storage + pgvector.
- Three Supabase clients exist on purpose — use the right one:
  `src/lib/supabase/client.ts` (browser), `server.ts` (Server
  Components/Actions, RLS-respecting), `admin.ts` (service role, bypasses
  RLS). Default to `client.ts` or `server.ts`. Reach for `admin.ts` only
  for webhooks, Coach Ted's pipeline, and scheduled jobs.
- Roles: `member`, `coach`, `owner`. Coaches have `coach_access_level`
  of `full` or `cover_and_kids_only` (Tommy is the only `cover_and_kids_only`
  coach right now).
- **Only the owner (Guy) creates or edits anything.** Coaches are
  view-only for the programme and mark attendance on their own sessions
  (migration 0024). Any new create/edit feature is `requireOwner()` plus
  an owner-only RLS write policy by default — never `requireCoachOrOwner()`.

## IMPORTANT: security rules that block on violation

These aren't suggestions — `.claude/hooks/pre-bash-guard.sh` enforces the
sharpest edges of this list automatically (secrets in commands, force-push
to main, etc). The rest depend on you reading this file.

- **Never bypass RLS to "make a query work."** If a query is blocked, the
  policy in `supabase/migrations/0002_rls_policies.sql` is doing its job.
  Fix the policy in a new migration, don't route around it with the admin
  client.
- **A new table is not done until it has an RLS policy in the same PR.**
  See `supabase/migrations/README.md`.
- **Never commit `.env.local` or print its contents.** Real secrets live
  only in Vercel's environment settings and the person's local machine.
- **`session_feedback` has no coach-read policy — this is deliberate.**
  Per the confirmed spec, only the owner sees individual ratings. Don't
  add one because it "seems useful."

## Where things go

- API routes: `src/app/api/<feature>/route.ts`
- Server-only logic that touches secrets: import from `@/lib/env`
  (`serverEnv()`), never read `process.env` directly in app code.
- Database changes: always a new file in `supabase/migrations/`, never
  a hand-edited existing one and never a direct change in the Supabase
  dashboard that isn't captured in a migration afterwards.
- Shared UI: `src/components/`. Don't create a second component library
  convention — extend what's there.

## Conventions

- Named exports, not default exports, for anything in `src/lib/`.
- Money is always integer pence (`price_pence`), never a float.
- Every new Supabase table needs a one-line `comment on table` if its
  purpose isn't obvious from the name — see existing migrations for the
  pattern.

## Verifying your own work

Run `npm run verify` (typecheck + lint) before considering a change done.
For anything touching bookings, credits, or payments, also state which
RLS policy governs the change and why it's still correct — don't just
assert the code works, show the policy that makes it safe.

## Treat mistakes as bugs in this file

If a rule gets missed, that's this file's fault, not a one-off. Ask to
add the missing rule here rather than just fixing the instance.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
