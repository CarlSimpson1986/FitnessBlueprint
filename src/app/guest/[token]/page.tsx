import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { GUEST_CONFIRM_HOURS, GYM_ADDRESS, GYM_PHONE } from "@/lib/guest-invites";
import { GuestResponseForm } from "./GuestResponseForm";

export const metadata: Metadata = {
  title: "You're invited — Fitness Blueprint",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public page: a guest has no account. The link's token is the only key —
 * get_guest_invite (0050) returns just what this page shows.
 */
export default async function GuestInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_guest_invite", { p_token: token });
  const invite = data?.[0];
  if (!invite) notFound();

  const when = `${formatSessionDate(invite.session_date)} at ${formatSessionTime(invite.start_time)}`;

  let body: React.ReactNode;
  if (invite.status === "confirmed") {
    body = (
      <p className="text-sm text-blueprint-ink">
        You&apos;re confirmed — see you there! Arrive 10 minutes early so the coach can say hello.
      </p>
    );
  } else if (invite.status === "declined" || invite.status === "cancelled") {
    body = <p className="text-sm text-blueprint-muted">This invite is no longer active.</p>;
  } else if (invite.lapsed) {
    body = (
      <p className="text-sm text-blueprint-muted">
        This needed confirming {GUEST_CONFIRM_HOURS} hours before the class, so the place has been released. Give us a
        ring on {GYM_PHONE} and we&apos;ll find you another one.
      </p>
    );
  } else {
    body = <GuestResponseForm token={token} />;
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <div>
          <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
          <h1 className="text-2xl font-semibold text-blueprint-ink">
            Hey {invite.guest_name.split(" ")[0]} — you&apos;re invited
          </h1>
          <p className="text-sm text-blueprint-muted mt-2">
            {invite.inviter_first_name} has booked you a free place at <strong className="text-blueprint-ink">{invite.class_name}</strong>,{" "}
            {when}.
          </p>
          <p className="text-xs text-blueprint-muted mt-2">{GYM_ADDRESS}</p>
        </div>
        {body}
        <p className="text-xs text-blueprint-muted">
          How we use your details:{" "}
          <Link href="/privacy" className="text-blueprint-accent underline">
            privacy notice
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
