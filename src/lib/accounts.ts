import "server-only";
import { randomBytes } from "crypto";
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

/**
 * Creates the login + profile with a one-time password (forced change on
 * first sign-in via app_metadata.must_change_password) and emails it.
 */
export async function createAccountWithWelcome(
  fullName: string,
  email: string,
  role: Role,
  welcomeLine?: string
): Promise<CreatedAccount> {
  const admin = createAdminClient();
  const password = randomBytes(9).toString("base64url");

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });

  if (createError || !data.user) {
    return { error: createError?.message ?? "Failed to create account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    email,
    full_name: fullName,
    role,
    coach_access_level: role === "coach" ? "full" : null,
  });

  if (profileError) {
    return { error: `Account created but profile setup failed: ${profileError.message}`, userId: data.user.id };
  }

  // Email them their temporary password (owner's call, 2026-09-25). It
  // only works once — they're forced to choose their own on first sign-in.
  const { error: emailError } = await sendEmail({
    to: email,
    subject: "Your Fitness Blueprint account",
    html: welcomeEmailHtml(fullName, email, password, role, welcomeLine),
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

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function welcomeEmailHtml(fullName: string, email: string, password: string, role: Role, welcomeLine?: string) {
  const firstName = escapeHtml(fullName.split(" ")[0] ?? fullName);
  const loginUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/login`;
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
  <p style="font-size:16px;line-height:1.5">${intro} Sign in with:</p>
  <p style="font-size:16px;line-height:1.7;background:#f3f5f7;border-radius:8px;padding:12px 16px">
    Email: <strong>${escapeHtml(email)}</strong><br>
    Temporary password: <strong style="font-family:Menlo,Consolas,monospace">${escapeHtml(password)}</strong>
  </p>
  <p style="margin:28px 0">
    <a href="${loginUrl}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">Sign in</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#666">You'll be asked to choose your own password the first time you sign in, and this temporary one stops working.</p>
  <p style="font-size:13px;color:#666;margin-top:28px">Fitness Blueprint</p>
</div>`.trim();
}
