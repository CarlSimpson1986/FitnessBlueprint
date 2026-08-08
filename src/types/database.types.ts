/**
 * PLACEHOLDER — not the real generated schema.
 *
 * Once the project is linked to a real Supabase project, regenerate
 * this file for real:
 *
 *   npx supabase link --project-ref <your-project-ref>
 *   npm run db:types
 *
 * That command overwrites this file completely with accurate,
 * strongly-typed table/RPC definitions generated from the actual
 * migrations. Until then this is deliberately `any`: postgrest-js's
 * generic query parser expects a fairly specific structural shape
 * (see node_modules/@supabase/postgrest-js/src/types/types.ts), and a
 * hand-written approximation of that shape produces confusing `never`
 * errors that are worse than just being honest that this isn't typed
 * yet. Every table/column name used elsewhere in this codebase matches
 * supabase/migrations/ — treat the SQL files as the source of truth
 * until this file is regenerated for real.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
