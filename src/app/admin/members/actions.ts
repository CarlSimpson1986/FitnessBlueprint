"use server";

import { randomBytes } from "crypto";
import { requireOwner } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";

// Deliberately no revalidatePath() in these — they're called directly
// from a client startTransition (not a <form action>), and pairing that
// with revalidatePath caused the transition's pending state to hang
// client-side indefinitely on success (see sessions/actions.ts). Each
// client component calls router.refresh() itself after success instead.

export type ActionResult = { error?: string };
export type CreateAccountResult = { error?: string; password?: string; emailed?: boolean; emailError?: string };
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
  email: string,
  role: "member" | "coach" | "owner" = "member"
): Promise<CreateAccountResult> {
  await requireOwner();

  // Staff accounts (Guy, coaches) are created here too — owner-only, same
  // one-time-password + forced-change flow as members.
  if (!["member", "coach", "owner"].includes(role)) {
    return { error: "Invalid role." };
  }

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
    email: trimmedEmail,
    full_name: trimmedName,
    role,
    coach_access_level: role === "coach" ? "full" : null,
  });

  if (profileError) {
    return { error: `Account created but profile setup failed: ${profileError.message}` };
  }

  // Email them their temporary password (owner's call, 2026-09-25). It
  // only works once — they're forced to choose their own on first sign-in
  // — and it's still shown on screen in case the email doesn't arrive.
  const { error: emailError } = await sendEmail({
    to: trimmedEmail,
    subject: "Your Fitness Blueprint account",
    html: welcomeEmailHtml(trimmedName, trimmedEmail, password, role),
  });
  if (emailError) console.error("createMemberAccount: welcome email failed —", emailError);

  return { password, emailed: !emailError, emailError };
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function welcomeEmailHtml(fullName: string, email: string, password: string, role: "member" | "coach" | "owner") {
  const firstName = escapeHtml(fullName.split(" ")[0] ?? fullName);
  const loginUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/login`;
  const intro =
    role === "member"
      ? "Your Fitness Blueprint account is ready. You can book sessions, log your workouts and chat with Coach Ted."
      : "Your Fitness Blueprint staff account is ready.";
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <h1 style="font-size:22px;margin:0 0 16px">Welcome, ${firstName}</h1>
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

/**
 * Permanently deletes a person — their login, profile and everything
 * that cascades from it (bookings, logs, goals, check-ins, Ted chats).
 * Owner-only via requireOwner(); the admin client is needed because
 * deleting a login is an auth-admin operation and the cleanup below
 * touches other members' rows (a buddy invite this person sent).
 *
 * A handful of references to profiles don't cascade (0001/0014): those
 * that only point at this person are cleared first. Staff who still
 * coach sessions or authored shared content are refused instead — that
 * content belongs to the gym, so it has to be reassigned first.
 */
export async function deletePerson(personId: string): Promise<ActionResult> {
  const { user } = await requireOwner();
  if (personId === user.id) {
    return { error: "You can't delete your own account." };
  }

  const admin = createAdminClient();

  const [sessions, templates, knowledge, challenges, plans, notes] = await Promise.all([
    admin.from("sessions").select("id", { count: "exact", head: true }).eq("coach_id", personId),
    admin.from("workout_templates").select("id", { count: "exact", head: true }).eq("created_by", personId),
    admin.from("coach_ted_knowledge_base").select("id", { count: "exact", head: true }).eq("created_by", personId),
    admin.from("challenges").select("id", { count: "exact", head: true }).eq("created_by", personId),
    admin.from("session_plans").select("id", { count: "exact", head: true }).eq("created_by", personId),
    admin.from("session_notes").select("id", { count: "exact", head: true }).eq("coach_id", personId),
  ]);
  const blockers = [
    sessions.count ? `coaches ${sessions.count} session${sessions.count === 1 ? "" : "s"}` : "",
    templates.count ? `wrote ${templates.count} workout template${templates.count === 1 ? "" : "s"}` : "",
    knowledge.count ? "wrote Coach Ted knowledge entries" : "",
    challenges.count ? "created challenges" : "",
    plans.count ? "wrote session plans" : "",
    notes.count ? "wrote notes on members" : "",
  ].filter(Boolean);
  if (blockers.length) {
    return { error: `Can't delete yet — this person ${blockers.join(", ")}. Reassign those first.` };
  }

  // Buddy invites they sent: pending ones are withdrawn, accepted ones
  // just lose the "invited by" link. Waitlist buddy pairings are unpaired.
  const cleanup = await Promise.all([
    admin.from("bookings").delete().eq("invited_by", personId).eq("status", "invited"),
    admin.from("bookings").update({ invited_by: null }).eq("invited_by", personId),
    admin.from("waitlist_entries").update({ buddy_member_id: null }).eq("buddy_member_id", personId),
    admin.from("events").delete().eq("created_by", personId),
    admin.from("credit_ledger").update({ created_by: null }).eq("created_by", personId),
  ]);
  const cleanupError = cleanup.find((r) => r.error)?.error;
  if (cleanupError) {
    return { error: cleanupError.message };
  }

  const { error } = await admin.auth.admin.deleteUser(personId);
  if (error) {
    return { error: error.message };
  }
  return {};
}
