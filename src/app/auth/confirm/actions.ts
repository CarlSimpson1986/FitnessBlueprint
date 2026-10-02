"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "recovery", "invite"];

/**
 * The "Sign in" button on /auth/confirm. Supabase's emailed links point
 * here with a token_hash (set in the Supabase email templates), which is
 * verified server-side — unlike the old ?code= links, this works whatever
 * browser or device the email is opened on.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;

  if (!tokenHash || !ALLOWED_TYPES.includes(type)) redirect("/login?error=auth_callback_failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) {
    console.error("confirmEmailLink: verifyOtp failed —", error?.message);
    redirect("/login?error=auth_callback_failed");
  }

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile) redirect("/onboarding");

  // Accounts made by the owner or the Stripe webhook still need a password.
  if (data.user.app_metadata?.must_change_password || type === "recovery") redirect("/login/set-password");

  redirect("/");
}
