# Fitness Blueprint

A PWA replacing Virtuagym for a single-site group PT gym. Next.js (App
Router) + Supabase + Vercel. Built to run for roughly £1/month at 140
members — see the full spec doc for the product decisions behind this.

This README covers **setup**. For **build rules**, see `CLAUDE.md`. For
the **security model**, see `SECURITY.md`.

## Prerequisites

- Node 20+ (`.nvmrc` pins this — run `nvm use` if you have nvm)
- [VS Code](https://code.visualstudio.com/) with the recommended
  extensions (`.vscode/extensions.json` — VS Code will prompt you)
- [Claude Code](https://claude.com/claude-code) — either the CLI or the
  VS Code extension (search "Claude Code" in the marketplace)
- A [Supabase](https://supabase.com) project
- Accounts for the services in `.env.example` as you get to each
  feature — you don't need all of them on day one

## First-time setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in real values
cp .env.example .env.local

# 3. Link this project to your Supabase project
npx supabase login
npx supabase link --project-ref <your-project-ref>

# 4. Run the migrations (creates every table + RLS policy + seed data)
npm run db:push

# 5. Generate real TypeScript types from the schema you just created
npm run db:types

# 6. Start the dev server
npm run dev
```

Open http://localhost:3000 — you should see a "Scaffold is live" status
page. If you see that, the app, Tailwind, and the design tokens are all
working.

## Project structure

```
.claude/              Claude Code config — hooks + permissions (see below)
.vscode/               Editor settings + recommended extensions
CLAUDE.md               Build rules Claude Code reads automatically
SECURITY.md              Full security model reference
middleware.ts             Security headers + auth session refresh, every request
public/
  manifest.json            PWA manifest
  sw.js                     Offline-capable service worker
supabase/
  migrations/                Schema + RLS policies, numbered and ordered
  seed.sql                    Reference data (membership plans, session types)
src/
  app/
    page.tsx                   Placeholder home page
    layout.tsx                   Root layout, PWA meta tags
    api/
      health/                      Uptime check
      webhooks/stripe/               Signature-verified payment webhook
      coach-ted/                      RAG + self-learning Q&A pipeline
  lib/
    env.ts                             Validated environment variables
    supabase/
      client.ts                          Browser client (RLS-respecting)
      server.ts                            Server client (RLS-respecting)
      admin.ts                              Service role client (BYPASSES RLS)
    coach-ted/
      gemini.ts                              Gemini Flash wrapper
      pubmed.ts                                PubMed search
  types/
    database.types.ts                          Regenerate via `npm run db:types`
```

## The three Supabase clients — read this before writing a query

- **`lib/supabase/client.ts`** — browser, respects RLS. Default choice
  for Client Components.
- **`lib/supabase/server.ts`** — server-side, still respects RLS, but
  sees the signed-in member's session via cookies. Default choice for
  Server Components and Server Actions.
- **`lib/supabase/admin.ts`** — service role, **bypasses RLS entirely**.
  Only for webhooks, Coach Ted's pipeline, and scheduled jobs. If a
  query is blocked and your instinct is "just use the admin client,"
  that instinct is wrong — fix the RLS policy instead. Full reasoning
  in `SECURITY.md`.

## Working with Claude Code

`.claude/settings.json` and `.claude/hooks/pre-bash-guard.sh` are
already wired up:

- **Hard blocks** (can't be talked around): reading `.env` files,
  recursive force-deletes of root/home, force-pushing to main,
  piping curl into a shell, hard-resetting main. These exit with code 2
  and Claude Code reads the reason automatically.
- **CLAUDE.md** is read automatically at the start of every session —
  it has the build rules (which Supabase client to use, where new files
  go, the RLS-in-the-same-PR rule).

The hook script tries `jq` first, falls back to `python3`, then `node`
for parsing tool input — it'll work regardless of which is installed,
but installing `jq` locally makes it marginally more precise.

## Database migrations

Numbered, ordered, and each one is described in
`supabase/migrations/README.md`. The short version: RLS policies get
added in the same migration as the table, or the very next one before
anything reads/writes it — never leave a table exposed with no policy.

```bash
supabase migration new descriptive_name   # create a new migration
npm run db:push                            # apply migrations
npm run db:reset                            # wipe + replay everything locally
npm run db:types                             # regenerate TypeScript types
```

## Coach Ted

The RAG + self-learning pipeline is scaffolded in
`src/app/api/coach-ted/route.ts` — three tiers: cache lookup, PubMed +
knowledge base search, Gemini synthesis. It's structurally complete and
type-checks, but needs real `GEMINI_API_KEY` and `PUBMED_API_KEY`
values to actually run. The system prompt and safety guardrails are in
`src/lib/coach-ted/gemini.ts` — read it before changing Ted's behaviour,
the constraints there (never diagnose, never override a coach) are
deliberate, not boilerplate.

## Verifying changes before they ship

```bash
npm run verify   # typecheck + lint, run this before considering anything done
npm run build    # full production build — catches issues typecheck/lint miss
```

Next.js 16 removed `next lint` — linting now runs directly via `eslint .`
(already wired into `npm run lint` and `npm run verify`), and is no
longer automatically part of `npm run build`. Run `verify` explicitly.

## What's already decided (don't relitigate without reason)

- **PWA, not native.** No App Store, "Add to Home Screen" only. See the
  spec doc for the full reasoning — the short version is a single gym
  with in-person onboarding doesn't need store discoverability.
- **Text-based session plans, not a drag-and-drop exercise builder.**
  Matches how the gym's coaches actually plan sessions.
- **`session_feedback` is owner-only.** Coaches don't see individual
  ratings — this was an explicit decision from the gym owner, not an
  oversight to "fix."
- **Free-tier infrastructure by design.** Supabase Free, Vercel Hobby,
  Brevo Free, Gemini Flash. This runs at ~£1/month for 140 members —
  don't upgrade a tier to solve a problem before confirming the free
  tier's actual limit is the cause.

## Deployment

Not yet wired up — when ready:

1. Push this repo to GitHub
2. Import into Vercel, set every variable from `.env.example` in
   Vercel's project settings (Production + Preview)
3. Point `NEXT_PUBLIC_SITE_URL` at the real domain
4. Update `supabase/config.toml`'s `site_url` and Supabase Auth's
   redirect URLs to match
5. Run migrations against the production Supabase project
   (`supabase link` to the prod ref, then `npm run db:push`)
