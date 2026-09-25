import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Thin wrapper around Brevo's transactional email REST API — plain fetch,
 * not the @getbrevo/brevo SDK, since this is one straightforward POST and
 * doesn't warrant a new dependency. See src/app/api/cron/reminders/route.ts
 * and the owner's "Send me a test email" action for callers.
 *
 * Returns an error (logs a warning, doesn't throw) if BREVO_API_KEY/BREVO_SENDER_EMAIL
 * are unset — Carl needs to verify a sending domain in Brevo before this
 * can go live, and the cron route shouldn't crash while that's pending.
 */
export function isInternalAddress(email: string) {
  return email.toLowerCase().endsWith(".invalid");
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<{ error?: string }> {
  const env = serverEnv();

  // Test/demo accounts use the reserved .invalid TLD (src/lib/test-accounts.ts,
  // src/lib/demo-data.ts). Sending to them would only bounce and hurt the
  // Brevo sender reputation.
  if (isInternalAddress(input.to)) {
    return {};
  }

  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    // Reported as an error (not a silent success) so callers can say the
    // email didn't go — e.g. the Members page no longer claims "Emailed".
    // Still no throw: the reminders cron logs it and retries tomorrow.
    console.warn(
      `sendEmail: BREVO_API_KEY or BREVO_SENDER_EMAIL not set — skipping send to ${input.to} ("${input.subject}")`
    );
    return { error: "Brevo isn't configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing in Vercel)." };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: "Fitness Blueprint" },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `Brevo send failed (${res.status}): ${body}` };
  }

  return {};
}
