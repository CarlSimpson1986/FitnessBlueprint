# Security

This app handles booking, payment, and health-adjacent data (injuries,
readiness check-ins, PAR-Q screening) for a group PT gym. This document
is the reference for how that's protected. CLAUDE.md points here rather
than duplicating it.

## Secrets

| Secret | Lives in | Never |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars (production), `.env.local` (dev) | Imported into a Client Component. `src/lib/supabase/admin.ts` hard-fails the build if this happens (`server-only` import). |
| `STRIPE_SECRET_KEY` | Vercel env vars | Committed, logged, or sent to the client. |
| `STRIPE_WEBHOOK_SECRET` | Vercel env vars | Skipped — every webhook handler must verify the signature before trusting the payload. |
| Anything in `.env.local` | Local machine only | Committed. It's gitignored — keep it that way. |

If a secret is ever committed, rotate it immediately (regenerate in the
provider dashboard) — removing it from git history alone is not enough,
assume it's compromised the moment it's pushed.

## Row Level Security

RLS is the primary access control layer, not an afterthought bolted on
after the schema. The rule: **RLS enabled + no policy = fully locked.**
Every table in `supabase/migrations/0001_init_core_schema.sql` gets its
policies defined in the very next migration file, before anything reads
or writes to it from application code.

Two tables have deliberately asymmetric access, worth knowing so nobody
"fixes" them by accident:

- **`session_feedback`** — members can insert their own feedback but
  there is no member-read or coach-read policy. Only the owner reads
  ratings. This was an explicit decision, not a gap.
- **`coach_ted_knowledge_base`** and **`coach_ted_qa_cache`** — no
  policies for `anon` or `authenticated` at all. These are touched
  exclusively through server-side API routes using the admin client, so
  a member can't write directly into Ted's knowledge base or forge a
  cached answer to manipulate what other members see.

## The three Supabase clients

| Client | File | Bypasses RLS? | Use for |
|---|---|---|---|
| Browser | `lib/supabase/client.ts` | No | Client Components |
| Server | `lib/supabase/server.ts` | No | Server Components, Server Actions — respects the signed-in member's session via cookies |
| Admin | `lib/supabase/admin.ts` | **Yes** | Webhooks, Coach Ted's pipeline, scheduled jobs only |

If you're reaching for the admin client because a query "isn't working,"
stop — that's almost always RLS correctly blocking something the code
shouldn't be able to do yet. Fix the policy, don't route around it.

## Payments

- Stripe and GoCardless webhook handlers (`src/app/api/webhooks/`)
  **must** verify the request signature before processing anything. An
  unverified webhook is an open door for anyone to fabricate a "payment
  succeeded" event.
- The Kids programme uses a separate Stripe Connect account so those
  funds route to the dedicated business bank account, per the confirmed
  spec — don't let Kids payments fall through to the default account.
- Card numbers are never touched by this app's own code — Stripe
  Elements/Checkout handles that entirely. If a PR ever includes a raw
  card number field, that's a stop-and-rethink moment, not a review
  comment.

## Coach Ted

- Rate limited to 20 questions per member per day (enforced server-side,
  not just in the UI — a client-side-only limit is not a limit).
- Every conversation is logged (`coach_ted_conversations`) and visible
  to the owner for quality review.
- Ted never diagnoses, never overrides a coach, never prescribes doses.
  These are guardrails in the system prompt, not just spec prose — if
  you touch the Coach Ted prompt, keep them.

## Headers & transport

`middleware.ts` sets CSP, X-Frame-Options, Referrer-Policy,
Permissions-Policy, and HSTS on every response. When a new third-party
script or embed is added (analytics, a new payment widget, etc.), widen
the CSP deliberately for that one domain — don't switch to a wildcard
because it's easier.

## Dependencies

Run `npm audit` periodically, not just when something breaks. This is a
small app with a small dependency tree by design (see the spec's
"what's removed" section) — keep it that way. Fewer dependencies is
itself a security property.

## Incident response

Single-developer, single-gym project — there's no formal on-call. If
something goes wrong (data exposure, compromised key, payment
discrepancy): rotate any exposed credential first, then figure out scope
and notify affected members if their data was involved. Don't wait to
have a perfect explanation before rotating a key.

## Data this app holds that deserves extra care

- PAR-Q / health screening responses
- Readiness check-in pain/injury notes
- Coach session notes (often about injuries or medical modifications)
- Emergency contact details
- Payment references (not card numbers — those stay with Stripe/GoCardless)

None of this is technically "special category" health data under UK
GDPR in the clinical sense, but it's treated with the same care:
minimum necessary access (see RLS policies above), and it's included in
the member data export/deletion flow when that's built.
