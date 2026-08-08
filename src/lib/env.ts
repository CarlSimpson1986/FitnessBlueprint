import { z } from "zod";

/**
 * Validated environment variables.
 *
 * Import from here, never from `process.env` directly. If a required
 * variable is missing, the app fails to boot with a clear error instead
 * of failing silently at 2am when a booking or payment breaks.
 *
 * Server-only secrets are validated separately from NEXT_PUBLIC_ values
 * so a missing server secret can never be papered over by client code.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

const serverOnlySchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  GOCARDLESS_ACCESS_TOKEN: z.string().optional(),
  GOCARDLESS_WEBHOOK_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  PUBMED_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
});

function parsePublicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}\n\nCheck .env.local against .env.example.`
    );
  }

  return parsed.data;
}

function parseServerEnv() {
  // Never call this from a Client Component — process.env server secrets
  // aren't even available in the browser bundle, but this guard makes the
  // mistake fail loudly and immediately rather than as a silent undefined.
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv was imported into client-side code. Server secrets must " +
        "never be bundled for the browser. Use publicEnv instead, or move " +
        "this logic into a Server Component / Route Handler."
    );
  }

  const parsed = serverOnlySchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    GOCARDLESS_ACCESS_TOKEN: process.env.GOCARDLESS_ACCESS_TOKEN,
    GOCARDLESS_WEBHOOK_SECRET: process.env.GOCARDLESS_WEBHOOK_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    PUBMED_API_KEY: process.env.PUBMED_API_KEY,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}\n\nCheck .env.local against .env.example.`
    );
  }

  return parsed.data;
}

export const publicEnv = parsePublicEnv();

// Lazy getter, not eagerly evaluated at module load — avoids crashing
// pages that never touch server secrets (e.g. during static generation).
export function serverEnv() {
  return parseServerEnv();
}
