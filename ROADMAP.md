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
- **Waitlist + buddy waitlist**: `waitlist_entries` (schema-only since
  `0001`) now has app code, wired up in migration `0010_waitlist.sql`.
  Members join a full session's waitlist, optionally naming a buddy by
  email ("only promote me if my friend also gets a spot" — confirmed
  owner priority); a freed spot becomes a **timed offer** (2-hour
  window, matches the `offered`/`offer_expires_at` columns already in
  the schema) rather than an instant auto-book. A buddy pair is only
  offered together, and if either half declines or times out the other
  reverts to waiting rather than losing their place. No push
  notifications or cron exist yet, so offers are swept lazily (next
  time `promote_waitlist` runs, e.g. on the next cancellation or
  accept/decline) instead of by a scheduled job — a member only learns
  about an offer by opening the app. Frontend: `WaitlistPanel.tsx` on
  the timetable, next to `BookingButton.tsx`.
- **Coach names on the member timetable** — fixed a latent bug found
  while building the waitlist: `0002_rls_policies.sql` only let a
  member read their own `profiles` row, so every session rendered
  "Coach TBC". Migration `0011_coach_names_for_members.sql` adds
  `list_coach_names()`, a narrow `security definer` RPC (same pattern
  as `lookup_member_by_email`) returning just `id, full_name` for
  coach/owner rows — deliberately not a plain RLS policy, since RLS is
  row-level and would've let any member pull a coach's phone number and
  emergency contact via a direct REST call.
- **Cancellation window enforcement** — `cancel_booking()` previously
  always refunded the credit with no time check. Migration
  `0012_cancellation_window.sql` now forfeits the credit (no extra fee)
  when cancelling within 3 hours of session start, per confirmed
  policy, and still refunds outside that window. `session_date`/
  `start_time` have no tz column and are treated as Europe/London
  wall-clock time, interpreted via `at time zone 'Europe/London'` so
  BST/GMT transitions resolve correctly. Note: a member currently gets
  no UI signal about which outcome happened (refunded vs. forfeited) —
  the cancel button just says "Cancel" either way; worth a small
  follow-up if it generates confused members/support questions.
- **Coach-initiated session cancellation is unaffected by the above,
  correctly** — `src/app/admin/sessions/actions.ts`'s "cancel whole
  session" path always refunds every booked member regardless of
  timing, since that's the gym cancelling, not a member's late
  cancellation. Noted here only so it isn't mistaken for a gap later.
- **Engine Race & events section** — `events`/`event_interests` (schema
  + RLS since `0001`/`0002`) had zero app code; now wired up. Homepage
  gets a folded-in "Events" section (same convention as session
  feedback) listing upcoming gym + member-posted events with an
  "I'm in" interest toggle (one-way — no delete/update policy on
  `event_interests`, same append-only shape as `challenge_participants`)
  and a "Post your own event" form for members. Coaches/owner get
  `/admin/events` to post official gym events (date, location,
  registration link, paid flag). No dedicated bottom-nav tab —
  low-frequency content, same reasoning that kept feedback off the nav.
- **Readiness check-in**: `readiness_checkins` (schema + RLS since
  `0001`/`0002`) had zero app code. Members get a compact feeling/sleep/
  pain-area check-in folded into the homepage's "Coming up" card for
  their next booked session (shown once per session — unlike
  `session_feedback`, this table *does* have a member-read policy, so
  "already submitted" is a real query, not a localStorage guess).
  Coaches/owner see it inline in the session roster (`/admin/sessions`)
  next to each member's name, flagged in red if they reported feeling
  "rough" or noted pain. No push notification — that's the actual
  confirmed-spec version ("pre-session push notification 10-second
  check-in") but push infra doesn't exist yet (Firebase env vars are
  present but nothing reads them); a member currently only sees the
  prompt by opening the app, same lazy pattern as waitlist offers.
- **6-week challenge tracker**: `challenges`/`challenge_participants`
  (schema + RLS since `0001`/`0002`) had zero app code. Members see a
  "Challenges" section on `/progress` — join an open challenge, or see
  ones a coach has already added them to — with a live progress bar for
  `attendance` and `habit` types, computed at read time from
  `bookings`/`habit_logs` (same convention as the attendance streak in
  `src/lib/progress.ts`), never a stored counter, since
  `challenge_participants.progress_value` has no RLS update policy for
  anyone but the service role. `event_prep` and `team` types have no
  automatic data source (no exercise/set-logging schema, no team/group
  table) — members just see "your coach is tracking this" instead of a
  guessed-at bar. Coaches/owner get `/admin/challenges` to create them.
  **Not built**: the shareable end-of-programme summary card the spec
  also mentions — that's image/sharing generation, a distinct piece of
  work from the tracker itself.
- **"What's On Today" session preview**: `session_plans` (schema + RLS
  since `0001`/`0002`) had zero app code. `/admin/session-plans` lets a
  coach paste one whole training block at once — a line with just a
  date (`YYYY-MM-DD`) starts each day's section (`src/lib/session-
  plans.ts` does the parsing) — matched against already-scheduled
  sessions of the chosen type and upserted in one `block_id` batch.
  `is_published` is set `true` immediately: the coach uploading the
  block *is* the publish decision, per the owner's "auto-publish day by
  day, not one-at-a-time entry" ask. The app only ever displays a plan
  for a session happening **today** (homepage for members, always
  visible to coaches/owner in `/admin/sessions`) — future days aren't
  shown by the UI, but note this isn't enforced by RLS itself, so a
  member hitting the REST API directly could technically read a future
  day's plan early. Accepted for v1: plan text isn't sensitive, unlike
  the profile/feedback data where the same class of gap was closed
  properly (`0011`, `session_feedback`'s no-coach-read policy).
- **Buddy booking** (non-waitlist): owner chose "invite-and-reserve" —
  a member who's already booked can invite a buddy by email; it
  reserves a real spot for 2 hours (counted everywhere a booked spot
  is, including the displayed "X/Y booked") without spending the
  buddy's credit, and the buddy accepts (spending their *own* credit,
  same checks as a normal booking) or declines. Either outcome — or a
  timeout — frees the spot and sweeps the waitlist, same as any other
  freed spot. Reuses `bookings` rather than a new table (a pending
  invite IS a reserved booking, just unconfirmed) via two new columns
  and a new `'invited'` status. **Needs two migrations run separately,
  in order**: `0013_booking_invited_status.sql` (just the new enum
  value — Postgres won't allow a new enum value to be used in the same
  transaction that adds it) must finish *before*
  `0014_buddy_booking.sql` (the columns, functions, and RLS) — pasting
  both into one SQL Editor query and running together will fail.

## Known gaps / not started

- **Stripe billing is not wired up.** `src/app/api/webhooks/stripe/route.ts`
  verifies signatures correctly but every event type (`checkout.session.completed`,
  `invoice.payment_failed`, `customer.subscription.deleted`) is a TODO stub.
  There's also no code anywhere that *creates* a Checkout Session or Payment
  Link, so there's no established metadata contract (e.g. how a Stripe
  session maps back to a `member_id`/`plan_id`) to build the handler against
  yet — that needs deciding before the TODOs can be filled in for real.
  **Explicitly raised and deferred (2026-09-20)**: since first sale is
  always an owner-sent payment link, not in-app self-serve, the question
  is how a Stripe customer/subscription maps back to a `member_id` when
  webhooks fire — options discussed were the owner setting
  `client_reference_id`/metadata when creating the link vs. matching by
  email. Owner chose not to decide this yet rather than guess — pick this
  up by asking directly, don't re-derive an answer from this note.
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
- **No local/CI Supabase.** This project has no `supabase start` (Docker)
  workflow verified working in this environment — migrations were applied
  by hand via the hosted project's SQL Editor because the `supabase` CLI's
  browser-login token wasn't reaching either the sandboxed or interactive
  shell here. Worth revisiting so `supabase db push` actually works.
- **Owner/business dashboards** — not started: at-risk member alerts,
  session economics (fill rate/no-show/revenue per session or coach),
  trial-to-member conversion tracking for the 6-week funnel. Revenue/
  fill-rate reporting specifically is blocked on Stripe billing above —
  there's no payments log to report on until that's wired up.
- **Merch** — deliberately trivial: just a link-out to the existing
  Squarespace shop, not a native shop. Owner confirmed volume doesn't
  justify more.

## Infra notes worth remembering

- Free-tier Supabase project auto-pauses after ~1 week of no API
  traffic (data isn't lost, just needs restoring from the dashboard).
