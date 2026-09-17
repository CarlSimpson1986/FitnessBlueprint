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
- **No local/CI Supabase.** This project has no `supabase start` (Docker)
  workflow verified working in this environment — migrations were applied
  by hand via the hosted project's SQL Editor because the `supabase` CLI's
  browser-login token wasn't reaching either the sandboxed or interactive
  shell here. Worth revisiting so `supabase db push` actually works.

## Infra notes worth remembering

- Free-tier Supabase project auto-pauses after ~1 week of no API
  traffic (data isn't lost, just needs restoring from the dashboard).
