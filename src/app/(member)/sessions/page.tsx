import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { formatSessionDate, formatSessionTime, toLocalDateKey } from "@/lib/format";
import { ReadinessCheckin } from "../ReadinessCheckin";
import { BookingButton } from "./BookingButton";
import { WaitlistPanel } from "./WaitlistPanel";
import { BuddyInvitePanel } from "./BuddyInvitePanel";
import { InviteResponsePanel } from "./InviteResponsePanel";
import { BookingsTabs } from "./BookingsTabs";

export default async function SessionsPage() {
  const { supabase, user } = await requireProfile();

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: sessions },
    { data: templates },
    { data: coaches },
    { data: activeMembership },
    { data: allPlans },
    { data: creditLedgerRows },
  ] = await Promise.all([
    supabase
      .from("sessions")
      .select("*")
      .eq("status", "scheduled")
      .gte("session_date", today)
      .order("session_date")
      .order("start_time"),
    supabase.from("session_templates").select("id, name"),
    supabase.rpc("list_coach_names"),
    supabase
      .from("member_memberships")
      .select("plan_id")
      .eq("member_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("membership_plans").select("id, name, credit_pack_size, sessions_per_week"),
    supabase.from("credit_ledger").select("delta").eq("member_id", user.id),
  ]);

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((s) => s.id);

  const planById = new Map((allPlans ?? []).map((p) => [p.id, p]));
  const activePlan = activeMembership ? planById.get(activeMembership.plan_id) : null;
  const activePlanName = activePlan?.name ?? null;
  const creditBalance = activePlan?.credit_pack_size
    ? (creditLedgerRows ?? []).reduce((sum, row) => sum + row.delta, 0)
    : null;

  // "X/Y this week" for capped recurring plans — mirrors the same
  // Mon-Sun boundary book_session() (0023) enforces server-side, so
  // what a member sees here always matches what actually blocks them.
  let weeklyUsed: number | null = null;
  if (activePlan?.sessions_per_week != null) {
    const now = new Date();
    const dow = now.getDay();
    const daysSinceMonday = dow === 0 ? 6 : dow - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysSinceMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const { data: weekSessions } = await supabase
      .from("sessions")
      .select("id")
      .gte("session_date", toLocalDateKey(weekStart))
      .lte("session_date", toLocalDateKey(weekEnd));

    const weekSessionIds = (weekSessions ?? []).map((s) => s.id);
    const { data: weekBookings } = weekSessionIds.length
      ? await supabase
          .from("bookings")
          .select("id")
          .eq("member_id", user.id)
          .eq("status", "booked")
          .in("session_id", weekSessionIds)
      : { data: [] };

    weeklyUsed = (weekBookings ?? []).length;
  }

  const [
    { data: myBookings },
    { data: spotsTaken },
    { data: myWaitlistEntries },
    { data: sentInvites },
    { data: myReadiness },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, session_id, status, invite_expires_at, invited_by")
      .eq("member_id", user.id)
      .in("status", ["booked", "invited"])
      .in("session_id", sessionIds),
    supabase.rpc("session_spots_taken", { p_session_ids: sessionIds }),
    supabase
      .from("waitlist_entries")
      .select("id, session_id, status, buddy_member_id, offer_expires_at")
      .eq("member_id", user.id)
      .in("session_id", sessionIds)
      .in("status", ["waiting", "offered"]),
    supabase
      .from("bookings")
      .select("id, session_id, member_id, status")
      .eq("invited_by", user.id)
      .eq("status", "invited")
      .in("session_id", sessionIds),
    supabase.from("readiness_checkins").select("session_id").eq("member_id", user.id).in("session_id", sessionIds),
  ]);

  const receivedInvites = (myBookings ?? []).filter(
    (b) => b.status === "invited" && b.invite_expires_at && b.invite_expires_at > new Date().toISOString()
  );

  const buddyIds = Array.from(
    new Set(
      [
        ...(myWaitlistEntries ?? []).map((e) => e.buddy_member_id),
        ...(sentInvites ?? []).map((i) => i.member_id),
        ...receivedInvites.map((b) => b.invited_by),
      ].filter((id): id is string => id !== null)
    )
  );

  const { data: buddyProfiles } = buddyIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", buddyIds)
    : { data: [] };

  const buddyNameById = new Map((buddyProfiles ?? []).map((p) => [p.id, p.full_name]));
  const waitlistEntryBySession = new Map(
    (myWaitlistEntries ?? []).map((e) => [
      e.session_id,
      {
        id: e.id,
        status: e.status as "waiting" | "offered",
        buddyName: e.buddy_member_id ? (buddyNameById.get(e.buddy_member_id) ?? null) : null,
        offerExpiresAt: e.offer_expires_at,
      },
    ])
  );
  const sentInviteBySession = new Map(
    (sentInvites ?? []).map((i) => [
      i.session_id,
      { id: i.id, buddyName: buddyNameById.get(i.member_id) ?? "your buddy", status: "invited" as const },
    ])
  );
  const receivedInviteBySession = new Map(
    receivedInvites.map((b) => [
      b.session_id,
      {
        bookingId: b.id,
        expiresAt: b.invite_expires_at!,
        inviterName: buddyNameById.get(b.invited_by!) ?? "Someone",
      },
    ])
  );

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const coachById = new Map((coaches ?? []).map((c) => [c.id, c]));
  const myBookingBySession = new Map(
    (myBookings ?? []).filter((b) => b.status === "booked").map((b) => [b.session_id, b.id])
  );
  const spotsBySession = new Map(
    (spotsTaken ?? []).map((s) => [s.session_id, Number(s.spots_taken)])
  );
  const checkedInSessionIds = new Set((myReadiness ?? []).map((r) => r.session_id));

  const sessionsByDate = new Map<string, typeof sessionRows>();
  for (const session of sessionRows) {
    const list = sessionsByDate.get(session.session_date) ?? [];
    list.push(session);
    sessionsByDate.set(session.session_date, list);
  }

  const todayKey = toLocalDateKey(new Date());

  const myBookingsContent = (
    <div className="space-y-2">
      {myBookingBySession.size === 0 ? (
        <p className="text-blueprint-muted text-sm">
          Nothing booked yet — switch to Schedule to grab a session.
        </p>
      ) : (
        sessionRows
          .filter((session) => myBookingBySession.has(session.id))
          .map((session) => {
            const template = templateById.get(session.template_id);
            const coach = coachById.get(session.coach_id);
            const bookingId = myBookingBySession.get(session.id)!;
            const taken = spotsBySession.get(session.id) ?? 0;

            return (
              <div key={session.id} className="fb-card">
                <div className="flex items-center justify-between gap-4 mb-1">
                  <p className="text-blueprint-ink font-medium">{template?.name ?? "Session"}</p>
                  {session.session_date === todayKey && (
                    <span className="text-[10px] font-mono uppercase tracking-wide text-blueprint-accent bg-blueprint-accent/15 rounded-full px-2 py-0.5">
                      Today
                    </span>
                  )}
                </div>
                <p className="text-xs text-blueprint-muted mb-3">
                  {formatSessionDate(session.session_date)} · {formatSessionTime(session.start_time)} ·{" "}
                  {coach ? coach.full_name : "Coach TBC"} · {taken}/{session.capacity} spots
                </p>
                <div className="flex items-center gap-2 mb-1">
                  <Link
                    href={`/sessions/${session.id}/live`}
                    className="fb-btn-secondary flex-1 text-center"
                  >
                    Start session
                  </Link>
                  <BookingButton sessionId={session.id} bookingId={bookingId} isFull={false} />
                </div>
                <ReadinessCheckin sessionId={session.id} hasCheckedIn={checkedInSessionIds.has(session.id)} />
              </div>
            );
          })
      )}
    </div>
  );

  const scheduleContent = (
    <div>
      {sessionsByDate.size === 0 && (
        <p className="text-blueprint-muted text-sm">No upcoming sessions scheduled yet.</p>
      )}

      <div className="space-y-8">
        {Array.from(sessionsByDate.entries()).map(([date, daySessions]) => (
          <section key={date}>
            <p className="fb-eyebrow mb-2">{formatSessionDate(date)}</p>
            <ul className="space-y-2">
              {daySessions.map((session) => {
                const template = templateById.get(session.template_id);
                const coach = coachById.get(session.coach_id);
                const bookingId = myBookingBySession.get(session.id) ?? null;
                const receivedInvite = receivedInviteBySession.get(session.id) ?? null;
                const sentInvite = sentInviteBySession.get(session.id) ?? null;
                const taken = spotsBySession.get(session.id) ?? 0;
                const isFull = taken >= session.capacity;

                return (
                  <li key={session.id} className="fb-card flex items-center justify-between gap-4">
                    <div>
                      <p className="text-blueprint-ink font-medium">
                        {formatSessionTime(session.start_time)} — {template?.name ?? "Session"}
                      </p>
                      <p className="text-xs text-blueprint-muted mt-1">
                        {coach ? coach.full_name : "Coach TBC"} · {taken}/{session.capacity} booked
                      </p>
                    </div>
                    {receivedInvite ? (
                      <InviteResponsePanel
                        bookingId={receivedInvite.bookingId}
                        inviterName={receivedInvite.inviterName}
                        expiresAt={receivedInvite.expiresAt}
                      />
                    ) : bookingId ? (
                      <div className="flex flex-col items-end">
                        <BookingButton sessionId={session.id} bookingId={bookingId} isFull={isFull} />
                        <BuddyInvitePanel sessionId={session.id} sentInvite={sentInvite} />
                      </div>
                    ) : isFull ? (
                      <WaitlistPanel
                        sessionId={session.id}
                        entry={waitlistEntryBySession.get(session.id) ?? null}
                      />
                    ) : (
                      <BookingButton sessionId={session.id} bookingId={bookingId} isFull={isFull} />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-1">
          <p className="fb-eyebrow">Fitness Blueprint</p>
          <HomeLink />
        </div>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Bookings</h1>

        {!activeMembership ? (
          <p className="text-sm text-red-400 mb-6 border-l-2 border-red-400 pl-3">
            No active membership — see the owner to get set up before booking.
          </p>
        ) : (
          <p className="text-xs text-blueprint-muted mb-6">
            {activePlanName}
            {creditBalance !== null &&
              ` · ${creditBalance} credit${creditBalance === 1 ? "" : "s"} remaining`}
            {weeklyUsed !== null &&
              ` · ${weeklyUsed}/${activePlan?.sessions_per_week} this week`}
          </p>
        )}

        <BookingsTabs myBookings={myBookingsContent} schedule={scheduleContent} />
      </div>
    </main>
  );
}
