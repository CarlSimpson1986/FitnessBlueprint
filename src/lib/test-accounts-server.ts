import "server-only";
import { randomBytes } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { TEST_ACCOUNTS, type TestAccountKind } from "@/lib/test-accounts";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Creates an auth user + profile that can only ever be signed into via an
 * owner-only server action (password is random and never shown). Shared by
 * the "view as" test accounts and the demo-data clients. Returns the
 * existing profile's id if the email is already set up.
 */
export async function ensureInternalAccount(
  admin: AdminClient,
  input: {
    email: string;
    fullName: string;
    role: "coach" | "member";
    appMetadata: Record<string, unknown>;
  }
): Promise<{ id?: string; error?: string }> {
  const { data: existing } = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
  if (existing) return { id: existing.id };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    app_metadata: input.appMetadata,
  });
  if (createError || !created.user) {
    return { error: createError?.message ?? `Could not create ${input.fullName}.` };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    email: input.email,
    full_name: input.fullName,
    role: input.role,
    coach_access_level: input.role === "coach" ? "full" : null,
  });
  if (profileError) {
    return { error: `${input.fullName} created but profile setup failed: ${profileError.message}` };
  }

  return { id: created.user.id };
}

export function ensureTestAccount(admin: AdminClient, kind: TestAccountKind) {
  const account = TEST_ACCOUNTS[kind];
  return ensureInternalAccount(admin, {
    email: account.email,
    fullName: account.fullName,
    role: account.role,
    appMetadata: { test_account: kind },
  });
}
