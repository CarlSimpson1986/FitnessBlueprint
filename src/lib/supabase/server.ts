import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Server Component / Route Handler / Server Action Supabase client.
 *
 * Still the anon key — still fully subject to RLS. This exists so
 * server-rendered pages see the signed-in member's own session (via
 * cookies) rather than an anonymous one. It does NOT bypass security;
 * it's the RLS-respecting client for server-side code.
 *
 * For anything that must bypass RLS (webhooks, Coach Ted writes,
 * scheduled jobs), use admin.ts instead — and think twice first.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render — middleware already
            // refreshes the session, so this is safe to swallow.
          }
        },
      },
    }
  );
}
