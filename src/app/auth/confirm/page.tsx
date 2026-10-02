import Link from "next/link";
import { confirmEmailLink } from "./actions";

/**
 * Landing page for Supabase's emailed sign-in links. Nothing is verified
 * until the button is pressed, so an email scanner that opens the link
 * first can't use it up (see confirmEmailLink).
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        {token_hash && type ? (
          <>
            <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Sign in</h1>
            <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
              Tap below to finish signing in.
            </p>
            <form action={confirmEmailLink}>
              <input type="hidden" name="token_hash" value={token_hash} />
              <input type="hidden" name="type" value={type} />
              <button
                type="submit"
                className="w-full bg-blueprint-accent text-blueprint-bg font-mono text-sm uppercase tracking-wide py-3 rounded hover:opacity-90 transition"
              >
                Sign in
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">This link didn&apos;t work</h1>
            <p className="text-blueprint-muted mb-8 text-sm leading-relaxed">
              Ask for a new one on the sign-in page.
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
