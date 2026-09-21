"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * No sign-out mechanism existed anywhere in the app before this — found
 * while rebuilding Profile per the spec's menu (Goals/Account settings/
 * Purchases & credits/Log out). A plain server action bound directly to a
 * <form action> in account/page.tsx; clears the Supabase auth cookies via
 * the SSR client, then redirects to /login.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
