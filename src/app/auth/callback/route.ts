import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Magic link lands here. Exchanges the one-time code for a session, then
 * routes first-time members to onboarding (no profiles row yet) versus
 * everyone else straight into the app.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }

    // Most common cause: the link was requested in a different browser
    // (or on a different host) than the one it was opened in, so the
    // PKCE code verifier cookie isn't here.
    console.error("auth callback: code exchange failed", error.message);
  } else {
    console.error("auth callback: no code in URL", searchParams.toString());
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
