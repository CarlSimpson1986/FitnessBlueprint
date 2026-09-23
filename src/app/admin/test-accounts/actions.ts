"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OWNER_RETURN_COOKIE, TEST_ACCOUNTS, type TestAccountKind } from "@/lib/test-accounts";

export type ActionResult = { error?: string };

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Owner-only "view as coach / member". Signs the owner into a real,
 * dedicated test account (created on first use) rather than faking a role
 * in the UI — so RLS applies exactly as it does for a real coach or member,
 * which is the whole point of testing (coach-scoped Today, no coach access
 * to session_feedback, weekly booking limit, ...). /view-as then shows the
 * app inside a phone frame.
 *
 * The admin client is needed only for what the service role alone can do:
 * creating the auth user + its profile row (same as createMemberAccount)
 * and minting a one-time sign-in token. Everything the test account does
 * after that goes through the normal RLS-respecting client.
 *
 * The owner's refresh token is stashed in an httpOnly cookie so "Back to
 * owner" can restore the session without a new magic link. We never call
 * signOut() when switching — that would revoke the owner's session.
 */
async function signInAsTestAccount(
  supabase: ServerSupabase,
  ownerRefreshToken: string,
  kind: TestAccountKind
): Promise<ActionResult> {
  const account = TEST_ACCOUNTS[kind];
  if (!account) {
    return { error: "Unknown test account." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", account.email)
    .maybeSingle();

  if (!existing) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: account.email,
      // Never shown or used — the only way in is this switch.
      password: randomBytes(24).toString("base64url"),
      email_confirm: true,
      app_metadata: { test_account: kind },
    });
    if (createError || !created.user) {
      return { error: createError?.message ?? "Could not create the test account." };
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      email: account.email,
      full_name: account.fullName,
      role: account.role,
      coach_access_level: account.role === "coach" ? "full" : null,
    });
    if (profileError) {
      return { error: `Test account created but profile setup failed: ${profileError.message}` };
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
  });
  if (linkError || !link.properties?.hashed_token) {
    return { error: linkError?.message ?? "Could not sign in to the test account." };
  }

  const cookieStore = await cookies();
  cookieStore.set(OWNER_RETURN_COOKIE, ownerRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) {
    cookieStore.delete(OWNER_RETURN_COOKIE);
    return { error: verifyError.message };
  }

  return {};
}

/**
 * Swaps the current (test) session back to the owner's, using the stashed
 * refresh token. Only ever hands back an owner session — anything else
 * signs out locally. Returns the owner's new refresh token (refreshing
 * rotates it).
 */
async function restoreOwnerSession(supabase: ServerSupabase): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(OWNER_RETURN_COOKIE)?.value;
  cookieStore.delete(OWNER_RETURN_COOKIE);
  if (!refreshToken) return null;

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  const { data: profile } = data.user
    ? await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle()
    : { data: null };

  if (error || !data.session || profile?.role !== "owner") {
    await supabase.auth.signOut({ scope: "local" });
    return null;
  }
  return data.session.refresh_token;
}

/** From the owner's own account: start viewing as a test coach/member. */
export async function switchToTestAccount(kind: TestAccountKind): Promise<ActionResult> {
  await requireOwner();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { error: "Your session has expired — sign in again." };
  }

  const result = await signInAsTestAccount(supabase, session.refresh_token, kind);
  if (result.error) return result;
  redirect(`/view-as?path=${encodeURIComponent(kind === "coach" ? "/admin" : "/")}`);
}

/** From inside /view-as: flip between the test coach and test member. */
export async function switchBetweenTestAccounts(kind: TestAccountKind): Promise<ActionResult> {
  const supabase = await createClient();
  const ownerRefreshToken = await restoreOwnerSession(supabase);
  if (!ownerRefreshToken) {
    redirect("/login");
  }

  const result = await signInAsTestAccount(supabase, ownerRefreshToken, kind);
  if (result.error) return result;
  redirect(`/view-as?path=${encodeURIComponent(kind === "coach" ? "/admin" : "/")}`);
}

/** Leave view-as and go back to the owner's own account. */
export async function returnToOwner(): Promise<void> {
  const supabase = await createClient();
  const ownerRefreshToken = await restoreOwnerSession(supabase);
  redirect(ownerRefreshToken ? "/admin" : "/login");
}
