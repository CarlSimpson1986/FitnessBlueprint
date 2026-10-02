"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isValidWelcomeToken } from "@/lib/accounts";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The "Set your password" button on /auth/welcome. Checks the welcome
 * link's token against the hash stored on the user (src/lib/accounts.ts),
 * then signs them in and sends them to choose a password.
 *
 * Runs on the button press, not on page load, so an email scanner that
 * opens links ahead of the member can't use the link up.
 *
 * The admin client is needed for two auth-admin operations: reading the
 * user's app_metadata and minting a one-time sign-in token. It writes no
 * table data.
 */
export async function acceptWelcomeLink(formData: FormData) {
  const userId = String(formData.get("u") ?? "");
  const token = String(formData.get("t") ?? "");
  const expired = "/auth/welcome?expired=1";

  if (!/^[0-9a-f-]{36}$/i.test(userId) || !token) redirect(expired);

  const admin = createAdminClient();
  const { data: found } = await admin.auth.admin.getUserById(userId);
  const user = found?.user;
  if (!user?.email || !isValidWelcomeToken(user.app_metadata, token)) redirect(expired);

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });
  if (linkError || !link.properties) {
    console.error("acceptWelcomeLink: generateLink failed —", linkError?.message);
    redirect(expired);
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: link.properties.verification_type as EmailOtpType,
    token_hash: link.properties.hashed_token,
  });
  if (verifyError) {
    console.error("acceptWelcomeLink: verifyOtp failed —", verifyError.message);
    redirect(expired);
  }

  redirect("/login/set-password");
}
