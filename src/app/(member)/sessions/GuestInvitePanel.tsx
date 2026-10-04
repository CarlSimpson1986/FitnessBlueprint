"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelGuestInvite, inviteGuest } from "./actions";
import { GUEST_CONFIRM_HOURS, GYM_PHONE } from "@/lib/guest-invites";

export type GuestInvite = {
  id: string;
  guestName: string;
  status: "invited" | "confirmed";
};

const INPUT =
  "text-xs bg-transparent border border-blueprint-line rounded-lg px-2 py-1.5 text-blueprint-ink placeholder:text-blueprint-muted w-44 text-right";

/** Refer a friend (0050): bring someone from outside the gym, free, once a month. */
export function GuestInvitePanel({
  sessionId,
  invite,
  passesLeft,
  isFull,
}: {
  sessionId: string;
  invite: GuestInvite | null;
  passesLeft: number;
  isFull: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    startTransition(() => router.refresh());
  }

  function handleInvite() {
    setError(null);
    setFull(false);
    startTransition(async () => {
      const result = await inviteGuest(sessionId, name, email);
      if (result.error) {
        setError(result.error);
        setFull(result.full === true);
        return;
      }
      setShareUrl(result.shareUrl ?? null);
      setName("");
      setEmail("");
      setShowForm(false);
      refresh();
    });
  }

  function handleCancel() {
    if (!invite) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelGuestInvite(invite.id);
      if (result.error) setError(result.error);
      else refresh();
    });
  }

  const messageUs = (
    <p className="text-xs text-blueprint-muted max-w-[16rem] text-right">
      Class is full — message us on{" "}
      <a href={`tel:${GYM_PHONE.replace(/\s/g, "")}`} className="text-blueprint-accent underline">
        {GYM_PHONE}
      </a>{" "}
      and we&apos;ll sort something out for your friend.
    </p>
  );

  if (invite) {
    return (
      <div className="mt-1 flex flex-col items-end gap-1">
        <p className="text-xs text-blueprint-muted text-right">
          {invite.status === "confirmed"
            ? `${invite.guestName} is coming with you`
            : `Invited ${invite.guestName} — they need to confirm ${GUEST_CONFIRM_HOURS}h before`}
        </p>
        {shareUrl && (
          <p className="text-xs text-amber-300 max-w-[16rem] text-right break-all">
            The email didn&apos;t send — send them this link: {shareUrl}
          </p>
        )}
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="text-xs text-blueprint-muted hover:text-red-400 disabled:opacity-50 transition"
        >
          Cancel invite
        </button>
        {error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
      </div>
    );
  }

  if (passesLeft < 1) {
    return <p className="mt-1 text-xs text-blueprint-muted text-right">Guest pass used this month</p>;
  }

  if (isFull && !showForm) {
    return <div className="mt-1">{messageUs}</div>;
  }

  return (
    <div className="mt-1 flex flex-col items-end gap-1">
      {showForm ? (
        <div className="flex flex-col items-end gap-1">
          <p className="text-[11px] text-blueprint-muted max-w-[16rem] text-right">
            Bring a friend who isn&apos;t a member, free. One guest pass a month.
          </p>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Friend's name" className={INPUT} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Friend's email" className={INPUT} />
          <button
            type="button"
            onClick={handleInvite}
            disabled={isPending || !name.trim() || !email.trim()}
            className="text-xs font-medium text-black bg-blueprint-accent rounded-lg px-3 py-1.5 hover:opacity-90 disabled:opacity-50 transition"
          >
            {isPending ? "…" : "Send invite"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-xs text-blueprint-muted hover:text-blueprint-accent transition"
        >
          Bring a friend free
        </button>
      )}
      {full ? messageUs : error && <p className="text-xs text-red-400 max-w-[16rem] text-right">{error}</p>}
    </div>
  );
}
