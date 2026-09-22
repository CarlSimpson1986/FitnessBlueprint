# Fitness Blueprint — Roadmap

Living record of what's built, what's known-broken, and what's next.
Update this file as work lands — don't let it drift. Full product
spec lives in the shared Google Doc; this is status, not spec.

## Done

- **Member app v2 — workout logging, goals, body metrics, IA rework.**
  Design pass done in Claude Desktop (build spec + session-template-spec +
  click-through mockup), implemented in six phases:
  - **Workout content model**: `sessions` → `session_segments` →
    `session_exercises` → `session_exercise_sets` (0015, 0020) — a coach
    builds a workout from scratch per session (no template library),
    warm-up/straight segments render sequentially for the member,
    `circuit` segments render all exercises open together. Each exercise
    is a list of individual sets (target/rest per set, added one at a
    time — an Everfit-style richer model than the original spec's single
    rounds count, revised mid-build after seeing it live), plus
    `each_side`/`tempo`/`note`.
  - **Reusable workout templates + program calendar** (0019): coaches
    build a named template once (`/admin/workout-templates`) and assign
    it onto scheduled sessions from a Mon–Sun, 1/2/4/6-week calendar
    (`/admin/program-calendar`) — copy-on-assign into the session's own
    content, not a live reference, so editing a template later doesn't
    retroactively change a session that already happened.
  - **Member live-logging**: "Start session" (`/sessions/[id]/live`) logs
    each set as the member goes (upsert on blur, resumes correctly across
    reloads); "Finish workout" self-marks attendance via the new
    `mark_self_attended` RPC (0018, security-definer, scoped to the
    caller's own booking, only once the session has started), shows a
    fun total-weight-lifted stat, and reuses the existing
    `submitFeedback` rating flow.
  - **Body metrics** widened from weight-only to weight/waist/body fat %
    (`body_metrics`, renamed from `weigh_ins`, 0017), each optional per
    entry, with its own logging screen (`/progress/log-metrics`).
  - **Progress tab overhaul**: tabbed body-metrics trend chart, 6-week
    total-lifted bar chart, 14-day habit-streak grid, personal records —
    all computed read-time from `exercise_logs`/`body_metrics` (no stored
    counters, same convention as the existing attendance-streak code).
  - **Goals**: a scripted goal-setting wizard (`/goals`) branded as Coach
    Ted but *not* built on the Gemini chat pipeline (that pipeline is
    single-turn/cache-first, wrong for structured data) — goal type,
    metric, long-term target, 6-week micro-target with a sanity-check
    (warns if the implied weekly rate is unsafe, using the member's real
    logged baseline), barriers, habits (from the real
    `habit_definitions`), optional why. "6-week check-in" re-runs a
    shorter version. Onboarding banner on Home (goals + starting metrics)
    and a goal-check-in-due banner, both computed from row existence, no
    new profile columns.
  - **Navigation/IA**: bottom nav reordered (My bookings/Coach Ted/
    Progress/Profile), a small Home icon added to every non-Home screen's
    header, Bookings split into "My bookings"/"Schedule" tabs, Profile
    rebuilt as a trimmed menu (Goals/Account settings/Purchases & credits/
    Log out — **Log out didn't exist anywhere in the app before this**,
    added as part of the rebuild), new view-only Purchases & credits
    screen.
  - **Coach subdomain**: `coach.fitnessblueprint.co.uk` rewrites
    transparently to `/admin/*` via `src/proxy.ts` (this Next.js version
    renamed `middleware.ts` → `proxy.ts` — see the file's own comment).
    Same Vercel project/env vars/database; RLS remains the actual
    security boundary, this is routing/branding only.
  - **Two real pre-existing bugs found and fixed along the way**, neither
    caused by this work: `createSessions` had a timezone bug rolling
    scheduled dates back a day (`toISOString()` vs `toLocalDateKey`), and
    migrations `0011` (coach-name lookup) and `0013`/`0014` (buddy
    booking columns) had silently never been applied to the live
    database — the member timetable's "Coach TBC" bug and a completely
    empty "My bookings" list were both live in production. All four are
    now applied and verified.

- **Auth**: magic-link sign-in, onboarding (name/phone/emergency
  contact), owner-issued password fallback with forced first-login
  password change.
- **Password-required signup** (2026-09-22): new members now create a
  password at `/signup` (`supabase.auth.signUp`) instead of getting in
  purely via magic link — owner's call ("everything locked down and
  password protected"). Magic link on `/login` is now sign-in only for
  accounts that already exist: `signInWithOtp` passes
  `shouldCreateUser: false`, so a brand-new email can no longer
  self-signup passwordlessly through the back door of the old magic-link
  flow. Existing members who signed up before this change and never set
  a password are **unaffected** — they still sign in via magic link and
  can add a password later at `/account` (that opt-in flow already
  existed). Onboarding itself (`/onboarding`) didn't need to change —
  it only ever checked for an authenticated user, not how they got one.
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

- **Email reminders via Brevo**: daily Vercel Cron
  (`src/app/api/cron/reminders/route.ts`) sends the Sunday check-in
  nudge, the 6-week goal check-in due reminder, and a quiet-member
  alert to the owner (2 missed weekly check-ins in a row) — the email
  half of a pattern whose in-app banners already existed. Idempotent
  via a new append-only `email_log` table (`0021`, unique on
  `recipient_id, email_type, reference_key`) so cron retries/overlaps
  can't double-send. Brevo chosen over Resend since `src/lib/env.ts`
  already reserved `BREVO_API_KEY`. Also backfilled `GOCARDLESS_ENVIRONMENT`
  into env validation — `.env.example` listed it but the schema never
  checked for it.
- **Owner income dashboard + 6-week conversion tracker**: `/owner/income`
  reads live totals + a transaction list straight from the Stripe and
  GoCardless APIs (This month / Last month) — no local payments table,
  no in-app checkout, since Guy's payment links and GoCardless mandates
  already exist outside the app. Reports "not configured" per provider
  rather than crashing if a key is unset, so this works independently of
  the Stripe-billing gap below. `/owner/conversions` lists members whose
  6-week programme ended without moving onto another paid plan since,
  computed from the existing `membership_plans.programme_length_days` —
  no new schema. Both owner-only, linked from the admin hub.
- **Owner dashboards: Month/Quarter/Year period picker + donut charts**
  (2026-09-22): `/owner/income` and `/owner/session-economics` both moved
  off the old this-month/last-month toggle onto a shared `PeriodPicker`
  (`src/lib/period.ts` + `src/components/PeriodPicker.tsx`) driven by
  `?unit=month|quarter|year&value=...` in the URL. Income gets a
  Stripe-vs-GoCardless donut; session economics gets an attended/
  no-show/excused breakdown donut (`src/lib/session-economics.ts` now
  tracks `attendedCount`/`excusedCount`, not just the no-show count).
  Shared `DonutChart` component + three chart-only series colors
  (`--fb-series-1/2/3` in `globals.css`) validated against the card
  surface with the dataviz skill's palette checker. Note: the dataviz
  skill's own guidance flags a 2-slice pie as an anti-pattern (a meter
  or stacked bar is the "correct" form) — built as a donut with a
  center total anyway since that was the explicit ask and it's a
  common, well-executed exception in practice.
- **Session economics dashboard**: `/owner/session-economics` — fill rate
  and no-show rate per coach, computed read-time from `sessions`/
  `bookings` for sessions that have already happened (`session_date` in
  the past, not coach-cancelled) in the selected month, same read-time-
  no-stored-counter convention as the challenge tracker and attendance
  streak. No-show rate is only computed over attendance-marked bookings
  (`attended`/`no_show`/`excused`) — a session the coach never marked
  attendance for isn't silently counted as zero no-shows, and the page
  surfaces a "sessions with attendance never marked" count so that gap
  is visible rather than hidden in the maths. Also lists the 10
  lowest-fill-rate sessions in the period. `src/lib/session-economics.ts`.
- **Next.js 16 migration: `middleware.ts` → `src/proxy.ts`**: this Next.js
  version deprecates root `middleware.ts` in favor of a `src/proxy.ts`
  convention, and having both files present broke the production build.
  Merged the coach-subdomain rewrite, Supabase session refresh, and
  security headers into the single `src/proxy.ts`. Pure infra fix, no
  behavior change intended.

- **Admin scheduling consolidated into Program Calendar** (2026-09-22,
  Stage 1 of the admin-consolidation plan): `/admin/sessions` and
  `/admin/session-plans` are both gone. `/admin/program-calendar` now
  has a sidebar with **Classes** (`session_templates` — FNL/KIDS/GC
  etc. — finally has real CRUD; there was previously no admin UI for
  this at all, only a read-only dropdown; RLS already permitted it),
  a **Workout templates** list, and **Schedule a session** (relocated
  `createSessions`/`cancelSession`, unchanged logic, now in
  `src/app/admin/program-calendar/schedule-actions.ts`). The per-session
  workout builder moved to
  `/admin/program-calendar/sessions/[sessionId]/workout`. The day-of
  attendance roster (mark attended/no-show/excused, readiness flags)
  got its own page, `/admin/today` — a different job from
  building/scheduling, so it didn't move into the calendar sidebar.
  **Session Plans (the free-text block-paste feature) is retired** —
  `workout_templates` + Program Calendar do that job properly now. Its
  two read-sites were updated: the member homepage no longer shows a
  "what's on today" plan-text block, and the admin session list (now
  gone anyway) no longer previews it. The `session_plans` table itself
  is untouched in the database (historical data, no destructive
  migration) — only app code stopped reading/writing it.
- **`SegmentExerciseEditor` redesigned for readability** (Stage 2 of
  the same plan): segments now render as a single top-to-bottom
  sequential list instead of a wrapping 2-3 column grid — they're a
  sequence (warmup → circuit → finisher), and the grid broke that
  reading order. Exercises collapse to a compact "name + set count"
  header and expand on click (tracked by key, so state survives
  reorders) instead of every exercise's full set-editor being open at
  once. Reorder buttons restyled smaller/secondary so segment content
  stays the visual focus. Shared by both the session workout builder
  and the workout-template editor — one component, both call sites
  fixed at once. Pure presentation-layer change, save flow/data shape
  untouched.
- **"Autofinish with AI"** (Stage 3, same plan): on a `workout_template`
  editor page, a coach can generate the rest of a block's weeks from
  week 1 (the template's current content) plus a plain-language
  progression instruction (e.g. "add a 4th set each week, don't touch
  week 4 — that's a deload"). Reuses Gemini (`src/lib/progression-ai/
  gemini.ts`, a sibling to Coach Ted's pipeline, not a reuse of
  `generateTedAnswer` — that one's system prompt is Ted-specific), with
  JSON-mode output so the result is structured data, not free text to
  parse. **Never a member-specific weight** — this is a group class, so
  the AI is instructed to only vary structural fields (sets, rest,
  exercise choice, and the free-text `target` string itself, e.g. "70%
  1RM x5" → "72.5% 1RM x5"), matching the confirmed decision that
  individual weight suggestions are a separate, out-of-scope feature.
  **Nothing is written to the database until the coach approves** each
  generated week — the generation action returns plain data to the
  browser, the coach reviews/edits it in the same `SegmentExerciseEditor`
  used everywhere else, and only clicking "Approve & assign" per week
  calls the existing, already-RLS-safe `saveWorkoutTemplate` +
  a new `assignTemplateToSessionsInWeek` (a small loop over the
  existing `assignTemplateToSession`, matching a class type + Mon-Sun
  week to already-scheduled sessions — no new bulk-assign primitive).
  **Needs `GEMINI_API_KEY` on Vercel to actually run** — see the
  "Pending manual action" note below; this was discovered mid-build to
  be missing from production entirely, not just local dev.

- **Ted walk-around**: a one-time guided intro shown the first time a
  member lands on the homepage — a short modal, branded as Coach Ted,
  stepping through the four bottom-nav tabs (My bookings/Coach Ted/
  Progress/Profile). New `profiles.has_seen_ted_tour` boolean (`0022`)
  since this genuinely can't be derived from existing data (a member
  with zero bookings/goals could still have already dismissed it) —
  everything else in this schema uses read-time row-existence instead
  of a stored flag, this is the exception because there's no existing
  row to check. `src/components/TedWalkaround.tsx` (client, dismiss on
  last step or Skip) + `src/app/(member)/ted-tour-actions.ts`
  (`markTedTourSeen`, fire-and-forget from the client — if it fails the
  member just sees the tour again next login, harmless). Degrades
  safely if migration `0022` isn't applied yet: `has_seen_ted_tour`
  reads as `undefined` (falsy) so the tour just always shows, same
  "ignore the Supabase gap" pattern as elsewhere in this app.

- **Weight suggestions on live-logging, from the member's own history**:
  the "separate, simpler feature" flagged as out-of-scope for Autofinish
  is now built. Each set on `/sessions/[id]/live` shows "Last time:
  Xkg × Y" (the member's own most recent log of that exercise name,
  same name-matching convention `progress.ts` already uses for personal
  records) and, when the coach's `target` text is written as "% 1RM"
  or "RPE" (confirmed as real usage, not hypothetical), a calculated
  "Suggested ~Zkg" — estimated via the Epley 1RM formula from that last
  log, applying the parsed percentage (or an RPE→%1RM approximation
  formula, `~2.5% per rep away from failure`, not a copied chart).
  **Reference only, by design** — nothing auto-fills; the member always
  types their own number, same as before. `src/lib/exercise-
  progression.ts` (pure functions, no DB access) + a new history lookup
  in `live/page.tsx` (matches by exercise name across all the member's
  past sessions, excluding the current session's own just-logged sets
  so nothing references itself).

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
- **No local/CI Supabase.** This project has no `supabase start` (Docker)
  workflow verified working in this environment — migrations were applied
  by hand via the hosted project's SQL Editor because the `supabase` CLI's
  browser-login token wasn't reaching either the sandboxed or interactive
  shell here. Worth revisiting so `supabase db push` actually works.
- **Owner/business dashboards, mostly done.** Income (`/owner/income`,
  read-only, live from Stripe/GoCardless), 6-week conversion tracking
  (`/owner/conversions`), and session economics (`/owner/session-economics`
  — fill rate and no-show rate per coach, computed read-time from
  sessions/bookings for whichever have already happened; also surfaces a
  "sessions with attendance never marked" count and a lowest-fill-rate
  list) are all shipped — see Done above. Still not started: at-risk
  member alerts as a dashboard view (the quiet-member *email* to the
  owner exists via the Brevo cron, but there's nowhere in-app to see who
  triggered it).
- **Merch** — deliberately trivial: just a link-out to the existing
  Squarespace shop, not a native shop. Owner confirmed volume doesn't
  justify more.

## Pending manual action

- **`GEMINI_API_KEY` is not set on Vercel production at all** (confirmed
  via `vercel env ls production` — not present under any name), not
  just missing locally as previously noted below. This means Coach Ted
  has likely been failing for real members since it shipped, and blocks
  the new "Autofinish with AI" feature (above) from running at all. Get
  a free key at aistudio.google.com (no card required) and add it to
  Vercel — no billing needed to get started, only if usage later hits
  free-tier rate limits.

- **Migration `0021_email_reminders.sql`** (email reminder log table) is
  written and committed but its hosted-DB status is unconfirmed as of
  this session — same manual SQL-Editor-paste workflow as every
  migration so far. Check it's actually been run before relying on the
  reminders cron; per the note below, this exact thing has silently
  slipped before.
- **`GOCARDLESS_ENVIRONMENT`** was added to `src/lib/env.ts` validation
  this session (019bf80) — confirm it's actually set in Vercel's
  env vars, since `.env.example` had listed it long before validation
  existed to catch it being missing.

## Infra notes worth remembering

- Free-tier Supabase project auto-pauses after ~1 week of no API
  traffic (data isn't lost, just needs restoring from the dashboard).
- Migrations `0011` and `0013`/`0014` had never been applied to the live
  database despite being on disk and referenced as done elsewhere in this
  file — discovered only because live testing hit the resulting errors
  (silently-empty query results, not crashes, so easy to miss). Worth a
  periodic sanity check that every file in `supabase/migrations/` has
  actually been run against the hosted project, not just committed.
