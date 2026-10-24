import { redirect } from "next/navigation";

/**
 * Public sign-up is closed (security audit, 2026-10-24; Supabase "Allow new
 * users to sign up" is off). Accounts come from a Stripe purchase or the
 * owner's Members page, and both email a set-your-password link
 * (src/lib/accounts.ts). Old links to /signup land on sign-in.
 */
export default function SignupPage() {
  redirect("/login");
}
