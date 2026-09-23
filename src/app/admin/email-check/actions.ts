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

  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    return { error: "Brevo isn't configured — BREVO_API_KEY or BREVO_SENDER_EMAIL is missing in Vercel." };
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
