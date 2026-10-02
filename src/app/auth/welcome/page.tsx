import Link from "next/link";
import { acceptWelcomeLink } from "./actions";

/**
 * Landing page for the "Set your password" button in the welcome email
 * (src/lib/accounts.ts). Nothing happens until the button is pressed —
 * see acceptWelcomeLink for why.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; expired?: string }>;
}) {
  const { u, t, expired } = await searchParams;
  const usable = !expired && u && t;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        {usable ? (
          <>
            <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Welcome</h1>
            <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
              Your account is ready. Choose a password and you&apos;re in.
            </p>
            <form action={acceptWelcomeLink}>
              <input type="hidden" name="u" value={u} />
              <input type="hidden" name="t" value={t} />
              <button
                type="submit"
                className="w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 transition"
              >
                Set my password
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">This link has expired</h1>
            <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
              It may be more than 7 days old, or your password is already set. On the sign-in page,
              choose &ldquo;Email me a sign-in link&rdquo; and we&apos;ll send you a fresh one.
            </p>
            <Link
              href="/login"
              className="block w-full text-center bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 transition"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
