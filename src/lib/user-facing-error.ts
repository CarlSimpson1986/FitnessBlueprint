// Turns a Supabase error into something safe to show a member or Guy.
// Raw Postgres messages ("new row violates row-level security policy for
// table …", "duplicate key value violates unique constraint …") leak table
// and policy names and mean nothing to the reader (security audit
// 2026-10-24), so they're logged here and replaced with plain words.
//
// Passed through unchanged:
// - Supabase Auth errors ("A user with this email address has already been
//   registered") — written for people already.
// - Our own `raise exception` messages from SQL functions ("This class is
//   full — message us…"): P0001 by default, P0002/22023 where a function
//   sets its own errcode.

type SupabaseLikeError = { message: string; code?: string; name?: string } | null | undefined;

const OWN_MESSAGE_CODES = new Set(["P0001", "P0002", "22023"]);

export function userFacingError(
  error: SupabaseLikeError,
  fallback = "Something went wrong — please try again."
): string {
  if (!error) return fallback;
  if (error.name?.startsWith("Auth")) return error.message;
  if (error.code && OWN_MESSAGE_CODES.has(error.code)) return error.message;

  console.error("Database error:", error.code ?? "(no code)", error.message);

  switch (error.code) {
    case "23505":
      return "That's already been saved.";
    case "42501":
      return "You don't have permission to do that.";
    case "23503":
      return "Something this needs has been removed — refresh and try again.";
    case "23502":
    case "23514":
    case "22P02":
      return "Something in that wasn't valid — check it and try again.";
    default:
      return fallback;
  }
}
