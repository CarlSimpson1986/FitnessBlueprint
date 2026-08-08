import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * ⚠️  ADMIN CLIENT — BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * This client uses the service role key, which ignores every RLS policy
 * in the database. Anything queried or written with this client can see
 * and touch every member's data.
 *
 * Legitimate uses (and roughly the whole list):
 *   - Stripe / GoCardless webhook handlers reconciling payment state
 *   - Coach Ted's server-side pipeline reading/writing the shared
 *     knowledge base and Q&A cache (members never get direct table access)
 *   - Scheduled jobs (e.g. monthly credit reset)
 *
 * Never:
 *   - Import this into a Client Component ("use client") — the
 *     `server-only` import above will hard-fail the build if you try.
 *   - Use this "to make a query work" when an RLS policy is blocking it.
 *     A blocked query is RLS doing its job — fix the policy in
 *     supabase/migrations, don't route around it here.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
