"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { userFacingError } from "@/lib/user-facing-error";

/**
 * Backup staff second step (0068): a 6-digit code emailed to the account,
 * for anyone stuck setting up the authenticator app (0038) or without
 * their phone. A verified code counts for this sign-in session only —
 * staff_session_verified() checks it in RLS.
 *
 * Uses the admin client on purpose: staff_signin_codes has no client
 * policies, so nobody signed in can read a code or mark their own session
 * verified. The server is the only thing that may — same reason accounts.ts
 * creates logins with it.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

function hashCode(sessionId: string, code: string) {
  return createHash("sha256").update(`${sessionId}:${code}`).digest("hex");
}

/** The signed-in staff member and their current auth session, or an error. */
async function staffSession() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub || !claims.session_id) return { error: "You're signed out — sign in again." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
  if (profile?.role !== "coach" && profile?.role !== "owner") return { error: "Only staff accounts need a code." };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user?.email || user.id !== claims.sub) return { error: "You're signed out — sign in again." };

  return { user, sessionId: claims.session_id };
}

function maskEmail(email: string) {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export async function sendStaffSignInCode(): Promise<{ error?: string; sentTo?: string }> {
  const staff = await staffSession();
  if ("error" in staff) return { error: staff.error };
  const { user, sessionId } = staff;
  const admin = createAdminClient();

  const { data: recent, error: recentError } = await admin
    .from("staff_signin_codes")
    .select("session_id, sent_at")
    .eq("user_id", user.id)
    .gte("sent_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recentError) return { error: userFacingError(recentError) };

  const thisSession = recent.find((r) => r.session_id === sessionId);
  if (thisSession && Date.now() - new Date(thisSession.sent_at).getTime() < RESEND_AFTER_MS) {
    return { error: "We've just sent one — check your inbox (and spam). You can ask for another in a minute." };
  }
  if (recent.length >= MAX_SENDS_PER_HOUR) {
    return { error: "Too many codes asked for — try again in an hour, or ask Guy." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: saveError } = await admin.from("staff_signin_codes").upsert({
    session_id: sessionId,
    user_id: user.id,
    code_hash: hashCode(sessionId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    sent_at: new Date().toISOString(),
    verified_at: null,
  });
  if (saveError) return { error: userFacingError(saveError, "Couldn't make a code — please try again.") };

  const { error: emailError } = await sendEmail({
    to: user.email!,
    subject: "Your Fitness Blueprint sign-in code",
    html: `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <p style="margin:0 0 12px">Your sign-in code is:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 20px">${code}</p>
  <p style="margin:0 0 12px;color:#555">It works for 10 minutes. If you didn't just try to sign in, someone may have your password — tell Guy and change it.</p>
</div>`.trim(),
  });
  if (emailError) return { error: "Couldn't send the email — please try again in a minute." };

  return { sentTo: maskEmail(user.email!) };
}

export async function verifyStaffSignInCode(code: string): Promise<{ error?: string; next?: string }> {
  const staff = await staffSession();
  if ("error" in staff) return { error: staff.error };
  const { user, sessionId } = staff;
  const admin = createAdminClient();

  const { data: row, error: rowError } = await admin
    .from("staff_signin_codes")
    .select("code_hash, expires_at, attempts, verified_at")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (rowError) return { error: userFacingError(rowError) };
  if (!row) return { error: "Ask for a code first." };

  const next = user.app_metadata?.must_change_password ? "/login/set-password" : "/";
  if (row.verified_at) return { next };
  if (new Date(row.expires_at).getTime() < Date.now()) return { error: "That code has expired — send a new one." };
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Too many wrong codes — send a new one." };

  const given = Buffer.from(hashCode(sessionId, code.trim()));
  const expected = Buffer.from(row.code_hash);
  const matches = given.length === expected.length && timingSafeEqual(given, expected);

  const { error: updateError } = await admin
    .from("staff_signin_codes")
    .update(matches ? { verified_at: new Date().toISOString() } : { attempts: row.attempts + 1 })
    .eq("session_id", sessionId);
  if (updateError) return { error: userFacingError(updateError) };

  if (!matches) return { error: "That code isn't right — check the latest email from us." };
  return { next };
}
