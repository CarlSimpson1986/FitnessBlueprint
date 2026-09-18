# Fitness Blueprint — Roadmap

Living record of what's built, what's known-broken, and what's next.
Update this file as work lands — don't let it drift. Full product
spec lives in the shared Google Doc; this is status, not spec.

## Done

- **Auth**: magic-link sign-in, onboarding (name/phone/emergency
  contact), owner-issued password fallback with forced first-login
  password change.
- **Member booking**: timetable view, book/cancel a session, upcoming
  bookings on the homepage.
- **Credits**: credit ledger, deduction on booking, monthly-reset
  reasoning documented in the schema.
- **Coach/owner session scheduling**: create/cancel sessions,
  day-by-day view, consolidated under `/admin`.
- **Attendance**: session roster with attendance marking (coach/owner).
- **Session feedback**: members rate class/effort/experience for
  sessions they attended in the last 14 days, inline on the homepage
  (no separate page — folded in directly under "upcoming bookings").
  Owner-only review at `/owner/feedback`; deliberately no coach-read
  policy on `session_feedback`.
- **Member email**: `profiles.email` now stored at creation time on
  both signup paths (self-service onboarding and owner-created
  accounts) — added in migration `0008_profiles_email.sql` after
  discovering neither path had ever captured it.
- **Optional password**: `/account` lets a self-signup (magic-link)
  member opt into setting a password, instead of only being available
  as an owner-forced fallback.
- **Design system v2 + bottom tab bar**: replaced the "blueprint" navy/
  monospace/tiled-grid theme (flagged as visually noisy) with a dark
  card-based look prototyped in Claude Desktop — near-black background,
  blue accent, plain sans-serif. Member-facing routes moved under
  `src/app/(member)/` behind a shared layout with a persistent bottom
  tab bar (Profile / My bookings / Coach Ted / Progress). Admin/auth
  routes keep the old page-based nav, just retextured to match.
- **Coach Ted — chat UI**: `src/lib/coach-ted/gemini.ts` and
  `src/app/api/coach-ted/route.ts` (Gemini 2.5 Flash + pgvector RAG,
  20 questions/member/day) existed fully built with **no frontend** —
  this was missing from this roadmap entirely until now. Added
  `/coach-ted` — a simple chat screen (`TedChat.tsx`) that calls the
  existing route and reads/displays conversation history from
  `coach_ted_conversations`. The backend itself is unchanged and still
  has no multi-turn memory (each question is answered independently).
- **Habits + progress tracking**: new `/progress` tab — a fixed,
  migration-seeded daily habit checklist (`habit_definitions`/
  `habit_logs`) and member-logged bodyweight (`weigh_ins`) feeding a
  simple weight-change stat, plus an attendance streak computed from
  `bookings.status = 'attended'` (consecutive weeks with ≥1 session,
  see `src/lib/progress.ts`). No admin UI to edit the habit list yet,
  and no "total lifted" stat — that needs exercise/set-logging schema
  that doesn't exist (see below).

## Known gaps / not started

- **Stripe billing is not wired up.** `src/app/api/webhooks/stripe/route.ts`
  verifies signatures correctly but every event type (`checkout.session.completed`,
  `invoice.payment_failed`, `customer.subscription.deleted`) is a TODO stub.
  There's also no code anywhere that *creates* a Checkout Session or Payment
  Link, so there's no established metadata contract (e.g. how a Stripe
  session maps back to a `member_id`/`plan_id`) to build the handler against
  yet — that needs deciding before the TODOs can be filled in for real.
- **`coach_access_level` is not enforced anywhere.** The column and enum
  exist (`cover_and_kids_only` vs `full`), and the schema comment says
  Tommy is the only `cover_and_kids_only` coach — but no RLS policy or
  app-code check actually restricts what a `cover_and_kids_only` coach
  can see or do. Right now Tommy has identical access to a full coach.
  `0001_init_core_schema.sql` even flags this in a comment on the
  `sessions` table (`valid_coach` constraint is a no-op placeholder).
- **No exercise/set logging.** There's no schema for coaches or members
  to log individual lifts (exercise, weight, reps) — session planning
  from a curated exercise library is still a whole unbuilt v1 feature.
  This is why Progress has no "total lifted" stat; add it once that
  schema exists rather than bolting on a throwaway manual-entry table.
- **Migration `0009_habit_and_progress_tracking.sql` needs manual
  application** — like every migration so far, apply it via the hosted
  Supabase project's SQL Editor (see the CLI gap below).
- **No local/CI Supabase.** This project has no `supabase start` (Docker)
  workflow verified working in this environment — migrations were applied
  by hand via the hosted project's SQL Editor because the `supabase` CLI's
  browser-login token wasn't reaching either the sandboxed or interactive
  shell here. Worth revisiting so `supabase db push` actually works.
- **Cancellation window is not enforced — a real bug against the
  confirmed policy.** `cancel_booking()` (`0005_booking_functions.sql`/
  `0007_credit_deduction.sql`) always refunds the credit on cancel with
  no time check at all. Confirmed policy: cancelling within 3 hours of
  session start should forfeit the credit (no extra fee); only outside
  that window should it refund. Needs a new migration.
- **Waitlist is schema-only, zero app code.** `waitlist_entries` +
  `waitlist_status` enum exist since `0001_init_core_schema.sql`
  (including a `buddy_member_id` column already anticipating buddy
  waitlists) but nothing in `src/` reads or writes the table. Biggest
  "half-built" feature in the schema.
- **Buddy booking / buddy waitlist** — not started. Explicitly flagged
  by the owner as a feature members would actually use (see spec notes
  in memory). No schema for member-to-member links yet.
- **"What's On Today" session preview** — not started. Owner wants
  bulk-upload of a whole training block's session plans that then
  auto-publish day by day, not one-at-a-time entry.
- **6-week challenge tracker** — not started. Distinct from the simpler
  Progress tab shipped above; this is the day-count/programme-phase
  framing tied to the onboarding funnel (`member_memberships`), plus a
  shareable end-of-programme summary card.
- **Readiness check-in** — not started. Pre-session push notification
  10-second check-in (feeling/pain/sleep), separate from the
  post-session feedback that already ships.
- **Owner/business dashboards** — not started: at-risk member alerts,
  session economics (fill rate/no-show/revenue per session or coach),
  trial-to-member conversion tracking for the 6-week funnel.
- **Engine Race & events section** — not started. Low-effort per the
  owner (3 races/year, monthly socials) but currently split across
  Squarespace/social with nothing in-app.
- **Merch** — deliberately trivial: just a link-out to the existing
  Squarespace shop, not a native shop. Owner confirmed volume doesn't
  justify more.

## Infra notes worth remembering

- Free-tier Supabase project auto-pauses after ~1 week of no API
  traffic (data isn't lost, just needs restoring from the dashboard).
