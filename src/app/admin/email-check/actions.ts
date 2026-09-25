"use server";

import { requireOwner } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { serverEnv } from "@/lib/env";

export type ActionResult = { error?: string; sentTo?: string };

/**
 * Owner-only: sends one email through Brevo to the owner's own address,
 * so "is Brevo actually working" is a click rather than waiting for the
 * reminders cron and hoping.
 */
export async function sendTestEmail(): Promise<ActionResult> {
  const { profile } = await requireOwner();
  const env = serverEnv();

  // Say exactly which setting is wrong — names and shapes only, never values.
  const key = (env.BREVO_API_KEY ?? "").trim();
  const sender = (env.BREVO_SENDER_EMAIL ?? "").trim();
  const problems = [
    !key
      ? "BREVO_API_KEY is empty on this deployment"
      : key.startsWith("xsmtpsib-")
        ? "BREVO_API_KEY is the SMTP key (xsmtpsib-) — it needs the API key (xkeysib-)"
        : !key.startsWith("xkeysib-")
          ? "BREVO_API_KEY doesn't look like a Brevo API key (should start xkeysib-)"
          : "",
    !sender ? "BREVO_SENDER_EMAIL is empty on this deployment" : !sender.includes("@") ? "BREVO_SENDER_EMAIL isn't an email address" : "",
  ].filter(Boolean);
  if (problems.length) {
    return { error: `Brevo setup problem: ${problems.join("; ")}.` };
  }
  if (!profile.email) {
    return { error: "Your profile has no email address." };
  }

  const result = await sendEmail({
    to: profile.email,
    subject: "Fitness Blueprint — test email",
    html: `<p>This is a test from Fitness Blueprint. If you're reading it, Brevo is working.</p><p>Sent from: ${env.BREVO_SENDER_EMAIL}</p>`,
  });
  return result.error ? { error: result.error } : { sentTo: profile.email };
}
