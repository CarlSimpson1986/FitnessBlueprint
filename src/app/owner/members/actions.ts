"use server";

import { randomBytes } from "crypto";
import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Deliberately no revalidatePath() in these — they're called directly
// from a client startTransition (not a <form action>), and pairing that
// with revalidatePath caused the transition's pending state to hang
// client-side indefinitely on success (see sessions/actions.ts). Each
// client component calls router.refresh() itself after success instead.

export type ActionResult = { error?: string };
export type CreateAccountResult = { error?: string; password?: string };
export type ResetPasswordResult = { error?: string; password?: string };

/**
 * Fallback for when a member's email doesn't work: the owner creates the
 * account directly with a generated password, hands it over in person,
 * and the account is forced to set its own password on first login
 * (app_metadata.must_change_password, cleared in /login/set-password).
 * Magic link remains the primary flow — this exists so a broken inbox
 * never blocks someone from being able to sign in at all.
 */
export async function createMemberAccount(
  fullName: string,
  email: string
): Promise<CreateAccountResult> {
  await requireOwner();

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim();

  if (!trimmedName) {
    return { error: "Name is required." };
  }
  if (!trimmedEmail) {
    return { error: "Email is required." };
  }

  const admin = createAdminClient();
  const password = randomBytes(9).toString("base64url");

  const { data, error: createError } = await admin.auth.admin.createUser({
    email: trimmedEmail,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });

  if (createError || !data.user) {
    return { error: createError?.message ?? "Failed to create account." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    full_name: trimmedName,
    role: "member",
  });

  if (profileError) {
    return { error: `Account created but profile setup failed: ${profileError.message}` };
  }

  return { password };
}

/**
 * Owner-issued password reset for an existing account whose email isn't
 * reachable (rate-limited, wrong address, etc). Same generated-password
 * + forced-change pattern as createMemberAccount. This is also how an
 * owner recovers their own account if they're signed in as one owner
 * account and need to reset another — it does NOT help if the *only*
 * owner account is completely logged out, since reaching this page
 * requires an active owner session in the first place. That case still
 * needs direct admin API access (see the one-off script pattern used to
 * bootstrap this the first time) until Brevo SMTP removes Supabase's
 * default mailer rate limit entirely.
 */
export async function resetMemberPassword(memberId: string): Promise<ResetPasswordResult> {
  await requireOwner();

  const admin = createAdminClient();
  const password = randomBytes(9).toString("base64url");

  const { error } = await admin.auth.admin.updateUserById(memberId, {
    password,
    app_metadata: { must_change_password: true },
  });

  if (error) {
    return { error: error.message };
  }

  return { password };
}

/**
 * Owner manually activates a membership after payment was taken outside
 * the app (Stripe link, GoCardless mandate — no checkout integration yet).
 * Uses the admin client because credit_ledger has no insert policy for
 * anyone but the service role, by design (see 0001) — writes happen
 * exclusively server-side. requireOwner() is what actually gates this;
 * the admin client bypassing RLS is not a workaround for a blocked
 * query, it's the sanctioned path for this kind of write.
 */
export async function assignMembership(
  memberId: string,
  planId: string
): Promise<ActionResult> {
  const { user: owner } = await requireOwner();

  const admin = createAdminClient();

  const { data: plan, error: planError } = await admin
    .from("membership_plans")
    .select("id, credit_pack_size")
    .eq("id", planId)
    .maybeSingle();

  if (planError || !plan) {
    return { error: "Plan not found." };
  }

  // A member should only ever have one active membership at a time —
  // retire any existing one before activating the new plan.
  const { error: retireError } = await admin
    .from("member_memberships")
    .update({ status: "cancelled" })
    .eq("member_id", memberId)
    .eq("status", "active");

  if (retireError) {
    return { error: retireError.message };
  }

  const { error: membershipError } = await admin.from("member_memberships").insert({
    member_id: memberId,
    plan_id: planId,
    status: "active",
  });

  if (membershipError) {
    return { error: membershipError.message };
  }

  if (plan.credit_pack_size) {
    const { error: creditError } = await admin.from("credit_ledger").insert({
      member_id: memberId,
      delta: plan.credit_pack_size,
      reason: "signup_bonus",
      created_by: owner.id,
    });

    if (creditError) {
      return { error: `Membership created but credit grant failed: ${creditError.message}` };
    }
  }

  return {};
}
