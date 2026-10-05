import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const NO_MEMBERSHIP_MESSAGE =
  "Coach Ted is for Fitness Blueprint members. Once your membership is set up, he's all yours.";

/**
 * True if the member has an active membership (any plan, including a
 * drop-in or 6-week programme). Read on their own RLS client — the
 * "member_memberships: read" policy only returns their own rows.
 */
export async function hasActiveMembership(supabase: Supabase, memberId: string) {
  const { data } = await supabase
    .from("member_memberships")
    .select("id")
    .eq("member_id", memberId)
    .eq("status", "active")
    .limit(1);
  return (data ?? []).length > 0;
}
