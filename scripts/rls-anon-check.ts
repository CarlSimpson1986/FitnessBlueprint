/**
 * What can someone who isn't signed in read? Uses only the public anon key
 * (the one shipped to every browser) and tries to read one row from every
 * table in src/types/database.types.ts. Read-only — safe against the live
 * database. Fails if any table not in PUBLIC_TO_ANON returns rows. A table
 * with no rows at all can't show a leak, so "no rows" on an empty table
 * proves nothing — the policy in the migrations is still the real check.
 *
 *   npm run test:rls   (reads NEXT_PUBLIC_SUPABASE_* from .env.local)
 *
 * Turned into a script from the security audit's manual anon test
 * (2026-10-24). A new table is covered automatically once it's in the
 * types file; a new table anon *should* read goes in PUBLIC_TO_ANON with
 * the migration that allows it.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_TO_ANON: Record<string, string> = {};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.");
  process.exit(1);
}

function publicTables(): string[] {
  const types = readFileSync("src/types/database.types.ts", "utf8");
  const schema = types.slice(types.indexOf("public: {"));
  const tables = schema.slice(schema.indexOf("Tables: {"), schema.indexOf("Views: {"));
  return [...tables.matchAll(/^ {6}([a-z_0-9]+): \{/gm)].map((m) => m[1]!);
}

async function main() {
  const supabase = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const leaks: string[] = [];

  for (const table of publicTables()) {
    // Table names come from the types file, so the typed client can't check them.
    const { data, error } = await supabase.from(table as "profiles").select("*").limit(1);
    const rows = data?.length ?? 0;
    const status = error ? `blocked (${error.code})` : rows > 0 ? "READABLE" : "no rows";
    const allowed = PUBLIC_TO_ANON[table];
    console.log(`${table.padEnd(28)} ${status}${allowed && rows > 0 ? ` — allowed: ${allowed}` : ""}`);
    if (rows > 0 && !allowed) leaks.push(table);
  }

  if (leaks.length > 0) {
    console.error(`\nSigned-out visitors can read: ${leaks.join(", ")}`);
    process.exit(1);
  }
  console.log("\nNothing readable without signing in beyond the allowed list.");
}

main();
