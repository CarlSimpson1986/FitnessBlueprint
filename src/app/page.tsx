const SCAFFOLDED = [
  "Next.js + TypeScript strict + Tailwind",
  "Supabase client/server/admin split",
  "Database schema — members, sessions, bookings, credits, waitlist",
  "Row Level Security on every table",
  "Coach Ted schema — RAG + self-learning Q&A cache",
  "Security headers (CSP, HSTS, frame protection) via middleware",
  "PWA manifest + offline-capable service worker",
  "Claude Code hooks — blocks secrets exposure & force-push to main",
];

const NOT_YET_BUILT = [
  "Auth screens (sign in / magic link)",
  "Member booking flow",
  "Coach live session cockpit",
  "Owner dashboard",
  "Stripe / GoCardless checkout",
  "Coach Ted chat UI",
];

export default function Home() {
  return (
    <main className="blueprint-grid min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full">
        <p className="font-mono text-xs tracking-[0.2em] text-blueprint-accent uppercase mb-3">
          Fitness Blueprint — Build Status
        </p>
        <h1 className="font-display text-3xl sm:text-4xl mb-2 text-blueprint-ink">
          Scaffold is live.
        </h1>
        <p className="text-blueprint-muted mb-10 leading-relaxed">
          This page confirms the app boots, Tailwind and the design tokens
          are wired up, and the service worker registers. Everything below
          is what Claude Code has to build next.
        </p>

        <section className="mb-8">
          <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-accent uppercase mb-3">
            ✓ Scaffolded
          </h2>
          <ul className="space-y-2">
            {SCAFFOLDED.map((item) => (
              <li
                key={item}
                className="flex gap-3 text-sm text-blueprint-ink/90 border-l-2 border-blueprint-line pl-3 py-0.5"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="font-mono text-xs tracking-[0.15em] text-blueprint-muted uppercase mb-3">
            Not built yet
          </h2>
          <ul className="space-y-2">
            {NOT_YET_BUILT.map((item) => (
              <li
                key={item}
                className="flex gap-3 text-sm text-blueprint-muted border-l-2 border-blueprint-muted/30 pl-3 py-0.5"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-xs text-blueprint-muted font-mono">
          See CLAUDE.md and SECURITY.md before extending this.
        </p>
      </div>
    </main>
  );
}
