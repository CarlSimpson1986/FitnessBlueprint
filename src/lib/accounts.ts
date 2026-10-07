import "server-only";
import { escapeHtml } from "@/lib/html";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";

/**
 * Account creation and membership activation, shared by the owner's
 * Members page (src/app/admin/members/actions.ts, gated by
 * requireOwner()) and the Stripe webhook (gated by Stripe's signature).
 * Neither function checks who's calling — the caller must.
 */

type Role = "member" | "coach" | "owner";
type AdminClient = ReturnType<typeof createAdminClient>;

export type CreatedAccount = {
  error?: string;
  userId?: string;
  password?: string;
  emailed?: boolean;
  emailError?: string;
};

/** How long the "Set your password" link in the welcome email works. */
const WELCOME_LINK_DAYS = 7;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates the login + profile and emails a "Set your password" link
 * (/auth/welcome). The email never contains a password: copying one out
 * of an email was too easy to get wrong (2026-10-02). The generated
 * password is still returned so the owner's Members page can show it for
 * an in-person handover; must_change_password forces a new one either way.
 *
 * Only a hash of the link token is stored, in app_metadata (which users
 * can't edit). It works until it expires or a password is set.
 */
export async function createAccountWithWelcome(
  fullName: string,
  email: string,
  role: Role,
  welcomeLine?: string
): Promise<CreatedAccount> {
  const admin = createAdminClient();
  const password = randomBytes(9).toString("base64url");
  const welcomeToken = randomBytes(32).toString("base64url");

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      must_change_password: true,
      welcome_token_hash: hashToken(welcomeToken),
      welcome_token_expires_at: new Date(Date.now() + WELCOME_LINK_DAYS * 86_400_000).toISOString(),
    },
  });

  if (createError || !data.user) {
    return { error: createError?.message ?? "Failed to create account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: fullName,
    role,
  });

  if (profileError) {
    return { error: `Account created but profile setup failed: ${profileError.message}`, userId: data.user.id };
  }

  const welcomeUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/welcome?u=${data.user.id}&t=${welcomeToken}`;
  const { error: emailError } = await sendEmail({
    to: email,
    subject: "Your Fitness Blueprint account",
    html: welcomeEmailHtml(fullName, email, welcomeUrl, role, welcomeLine),
  });
  if (emailError) console.error("createAccountWithWelcome: welcome email failed —", emailError);

  return { userId: data.user.id, password, emailed: !emailError, emailError };
}

/**
 * Makes `planId` the member's one active membership: retires any current
 * one, inserts the new row and, for credit packs, grants the credits.
 * Uses the admin client because credit_ledger has no insert policy for
 * anyone but the service role, by design (see 0001).
 */
export async function activateMembership(
  admin: AdminClient,
  input: {
    memberId: string;
    planId: string;
    createdBy: string | null;
    stripeCheckoutSessionId?: string;
    stripeSubscriptionId?: string | null;
    stripeCustomerId?: string | null;
  }
): Promise<{ error?: string }> {
  const { data: plan, error: planError } = await admin
    .from("membership_plans")
    .select("id, credit_pack_size")
    .eq("id", input.planId)
    .maybeSingle();

  if (planError || !plan) {
    return { error: "Plan not found." };
  }

  const { error: retireError } = await admin
    .from("member_memberships")
    .update({ status: "cancelled" })
    .eq("member_id", input.memberId)
    .eq("status", "active");

  if (retireError) {
    return { error: retireError.message };
  }

  const { error: membershipError } = await admin.from("member_memberships").insert({
    member_id: input.memberId,
    plan_id: input.planId,
    status: "active",
    stripe_checkout_session_id: input.stripeCheckoutSessionId ?? null,
    stripe_subscription_id: input.stripeSubscriptionId ?? null,
    stripe_customer_id: input.stripeCustomerId ?? null,
  });

  if (membershipError) {
    return { error: membershipError.message };
  }

  if (plan.credit_pack_size) {
    const { error: creditError } = await admin.from("credit_ledger").insert({
      member_id: input.memberId,
      delta: plan.credit_pack_size,
      reason: "signup_bonus",
      created_by: input.createdBy,
    });

    if (creditError) {
      return { error: `Membership created but credit grant failed: ${creditError.message}` };
    }
  }

  return {};
}

/**
 * True if `token` is the live welcome-link token for this user. Only
 * meaningful while they still have to set a password.
 */
export function isValidWelcomeToken(appMetadata: Record<string, unknown> | undefined, token: string) {
  const storedHash = appMetadata?.welcome_token_hash;
  const expiresAt = appMetadata?.welcome_token_expires_at;
  if (appMetadata?.must_change_password !== true) return false;
  if (typeof storedHash !== "string" || typeof expiresAt !== "string") return false;
  if (Date.parse(expiresAt) < Date.now()) return false;
  const given = Buffer.from(hashToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}


function welcomeEmailHtml(fullName: string, email: string, welcomeUrl: string, role: Role, welcomeLine?: string) {
  const firstName = escapeHtml(fullName.split(" ")[0] ?? fullName);
  const intro =
    role === "member"
      ? "Your Fitness Blueprint account is ready. You can book sessions, log your workouts and chat with Coach Ted."
      : "Your Fitness Blueprint staff account is ready.";
  const extra = welcomeLine ? `<p style="font-size:16px;line-height:1.5">${escapeHtml(welcomeLine)}</p>` : "";
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <h1 style="font-size:22px;margin:0 0 16px">Welcome, ${firstName}</h1>
  ${extra}
  <p style="font-size:16px;line-height:1.5">${intro} Tap below to choose your password and you're in.</p>
  <p style="margin:28px 0">
    <a href="${welcomeUrl}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">Set your password</a>
  </p>
  <p style="font-size:15px;line-height:1.5"><strong>Getting the app on your phone:</strong> on Android, open the app in <strong>Chrome</strong> (not Samsung Internet — your phone may block that install as unsafe) and tap <strong>Get app</strong> at the bottom. On iPhone, use <strong>Safari</strong> and tap Get app.</p>
  <p style="font-size:13px;line-height:1.5;color:#666">Your sign-in email is <strong>${escapeHtml(email)}</strong>. This button works for ${WELCOME_LINK_DAYS} days. After that, choose "Email me a sign-in link" on the sign-in page instead.</p>
  <p style="font-size:13px;color:#666;margin-top:28px">Fitness Blueprint</p>
</div>`.trim();
}

export { escapeHtml };
