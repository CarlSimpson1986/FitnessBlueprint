import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Thin wrapper around Brevo's transactional email REST API — plain fetch,
 * not the @getbrevo/brevo SDK, since this is one straightforward POST and
 * doesn't warrant a new dependency. See src/app/api/cron/reminders/route.ts
 * for the only caller.
 *
 * No-ops (logs a warning, doesn't throw) if BREVO_API_KEY/BREVO_SENDER_EMAIL
 * are unset — Carl needs to verify a sending domain in Brevo before this
 * can go live, and the cron route shouldn't crash while that's pending.
 */
export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<{ error?: string }> {
  const env = serverEnv();

  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    console.warn(
      `sendEmail: BREVO_API_KEY or BREVO_SENDER_EMAIL not set — skipping send to ${input.to} ("${input.subject}")`
    );
    return {};
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
