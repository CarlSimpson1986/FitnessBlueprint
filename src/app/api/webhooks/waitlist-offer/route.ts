import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInternalAddress } from "@/lib/email";
import { sendOnce } from "@/lib/email-log";
import { serverEnv } from "@/lib/env";
import { formatSessionTime } from "@/lib/format";
import { waitlistOfferHtml } from "@/lib/session-emails";

function authorised(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Database webhook (0051): Postgres calls this the moment a waitlist entry
 * becomes 'offered', whichever function did it (a cancel, a declined guest,
 * a lapsed offer). It only carries the entry id; everything else is read
 * fresh here, so a stale or forged call can at most re-send a real, live
 * offer — and email_log makes that a no-op. Admin client: a webhook, the
 * use admin.ts allows. Shares CRON_SECRET with the cron jobs.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (!authorised(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { entry_id?: unknown } | null;
  const entryId = typeof body?.entry_id === "string" ? body.entry_id : null;
  if (!entryId) return NextResponse.json({ error: "entry_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: entry } = await supabase
    .from("waitlist_entries")
    .select("id, member_id, session_id, status, offered_at, offer_expires_at")
    .eq("id", entryId)
    .maybeSingle();
  if (!entry || entry.status !== "offered" || !entry.offer_expires_at || new Date(entry.offer_expires_at) <= new Date()) {
    return NextResponse.json({ skipped: "no live offer" });
  }

  const [{ data: member }, { data: session }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").eq("id", entry.member_id).maybeSingle(),
    supabase.from("sessions").select("session_date, start_time, template_id, coach_id").eq("id", entry.session_id).maybeSingle(),
  ]);
  if (!member?.email || !session || isInternalAddress(member.email)) {
    return NextResponse.json({ skipped: "no address" });
  }

  const [{ data: template }, { data: coach }] = await Promise.all([
    supabase.from("session_templates").select("name").eq("id", session.template_id).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", session.coach_id).maybeSingle(),
  ]);
  const info = {
    className: template?.name ?? "Your session",
    coachName: coach?.full_name ?? null,
    sessionDate: session.session_date,
    startTime: session.start_time,
  };

  const outcome = await sendOnce(
    supabase,
    // One email per offer: a later re-offer of the same entry is a new one.
    { recipient_id: member.id, email_type: "waitlist_offer", reference_key: `${entry.id}:${entry.offered_at}` },
    {
      to: member.email,
      subject: `A place opened up: ${info.className} at ${formatSessionTime(info.startTime)}`,
      html: waitlistOfferHtml(member.full_name, info, new Date(entry.offer_expires_at)),
    }
  );
  return NextResponse.json({ outcome });
}
