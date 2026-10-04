import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type EmailAttachment } from "@/lib/email";
import type { Database } from "@/types/database.types";

type AdminClient = ReturnType<typeof createAdminClient>;
export type EmailLogRow = Pick<
  Database["public"]["Tables"]["email_log"]["Insert"],
  "recipient_id" | "email_type" | "reference_key"
>;

/**
 * Claims the email_log row, then sends. The row is what makes retries
 * idempotent (unique on recipient/type/reference, 0021), but it must only
 * stand if the send actually worked — otherwise a Brevo failure would be
 * recorded as sent and never retried. On failure the claim is released so
 * the next run tries again, and the error is logged. Admin client only:
 * email_log has no member write policy (cron jobs and webhooks).
 */
export async function sendOnce(
  supabase: AdminClient,
  log: EmailLogRow,
  email: { to: string; subject: string; html: string; attachments?: EmailAttachment[] }
): Promise<"sent" | "already" | "failed"> {
  const { error: logError } = await supabase.from("email_log").insert(log);
  if (logError) return "already"; // unique violation = already sent

  const { error } = await sendEmail(email);
  if (error) {
    console.error(`sendOnce: ${log.email_type} to ${email.to} failed — ${error}`);
    await supabase
      .from("email_log")
      .delete()
      .eq("recipient_id", log.recipient_id)
      .eq("email_type", log.email_type)
      .eq("reference_key", log.reference_key);
    return "failed";
  }
  return "sent";
}
