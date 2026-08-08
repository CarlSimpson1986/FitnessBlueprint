import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Browser-side Supabase client.
 *
 * Uses the anon key only. Every query made with this client is subject
 * to Row Level Security — that's the entire safety model. If a query
 * should be able to see or change data across members, it does NOT
 * belong here; it belongs in a server-side route using the admin client.
 */
export function createClient() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
