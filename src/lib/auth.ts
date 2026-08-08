import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Component / Server Action guard: redirects to /login if not
 * signed in, or /onboarding if signed in but the profiles row doesn't
 * exist yet. Returns the RLS-respecting server client alongside the
 * user and profile so callers don't have to create their own.
 */
export async function requireProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/onboarding");
  }

  return { supabase, user, profile };
}

/** Same as requireProfile, but also redirects home if the caller isn't the owner. */
export async function requireOwner() {
  const result = await requireProfile();

  if (result.profile.role !== "owner") {
    redirect("/");
  }

  return result;
}

/** Same as requireProfile, but also redirects home unless the caller is a coach or the owner. */
export async function requireCoachOrOwner() {
  const result = await requireProfile();

  if (result.profile.role !== "coach" && result.profile.role !== "owner") {
    redirect("/");
  }

  return result;
}
