"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { error?: string };

/**
 * app_metadata can only be changed via the admin API, never by the user
 * themselves — that's deliberate, so a member can't just clear the flag
 * client-side without actually changing their password first.
 */
export async function clearMustChangePasswordFlag(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    // Also retires the welcome link (src/lib/accounts.ts).
    app_metadata: { must_change_password: false, welcome_token_hash: null, welcome_token_expires_at: null },
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
