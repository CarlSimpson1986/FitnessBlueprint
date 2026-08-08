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
    app_metadata: { must_change_password: false },
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
