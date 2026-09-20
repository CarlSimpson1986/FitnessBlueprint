import { requireProfile } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { BookingButton } from "./BookingButton";
import { WaitlistPanel } from "./WaitlistPanel";

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
    supabase.from("membership_plans").select("id, name, credit_pack_size"),
    supabase.from("credit_ledger").select("delta").eq("member_id", user.id),
  ]);

  const sessionRows = sessions ?? [];
  const sessionIds = sessionRows.map((s) => s.id);

  const [{ data: myBookings }, { data: spotsTaken }, { data: myWaitlistEntries }] =
    await Promise.all([
      supabase
        .from("bookings")
        .select("id, session_id")
        .eq("member_id", user.id)
        .eq("status", "booked")
        .in("session_id", sessionIds),
      supabase.rpc("session_spots_taken", { p_session_ids: sessionIds }),
      supabase
        .from("waitlist_entries")
        .select("id, session_id, status, buddy_member_id, offer_expires_at")
        .eq("member_id", user.id)
        .in("session_id", sessionIds)
        .in("status", ["waiting", "offered"]),
    ]);

  const buddyIds = Array.from(
    new Set(
      (myWaitlistEntries ?? [])
        .map((e) => e.buddy_member_id)
        .filter((id): id is string => id !== null)
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

  const planById = new Map((allPlans ?? []).map((p) => [p.id, p]));
  const activePlan = activeMembership ? planById.get(activeMembership.plan_id) : null;
  const activePlanName = activePlan?.name ?? null;
  const creditBalance = activePlan?.credit_pack_size
    ? (creditLedgerRows ?? []).reduce((sum, row) => sum + row.delta, 0)
    : null;

  const templateById = new Map((templates ?? []).map((t) => [t.id, t]));
  const coachById = new Map((coaches ?? []).map((c) => [c.id, c]));
  const myBookingBySession = new Map((myBookings ?? []).map((b) => [b.session_id, b.id]));
  const spotsBySession = new Map(
    (spotsTaken ?? []).map((s) => [s.session_id, Number(s.spots_taken)])
  );

  const sessionsByDate = new Map<string, typeof sessionRows>();
  for (const session of sessionRows) {
    const list = sessionsByDate.get(session.session_date) ?? [];
    list.push(session);
    sessionsByDate.set(session.session_date, list);
  }

  return (
    <main className="min-h-screen px-5 py-8">
      <div className="max-w-2xl mx-auto">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Timetable</h1>

        {!activeMembership ? (
          <p className="text-sm text-red-400 mb-6 border-l-2 border-red-400 pl-3">
            No active membership — see the owner to get set up before booking.
          </p>
        ) : (
          <p className="text-xs text-blueprint-muted mb-6">
            {activePlanName}
            {creditBalance !== null &&
              ` · ${creditBalance} credit${creditBalance === 1 ? "" : "s"} remaining`}
          </p>
        )}

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
                  const taken = spotsBySession.get(session.id) ?? 0;
                  const isFull = taken >= session.capacity;

                  return (
                    <li
                      key={session.id}
                      className="fb-card flex items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-blueprint-ink font-medium">
                          {formatSessionTime(session.start_time)} — {template?.name ?? "Session"}
                        </p>
                        <p className="text-xs text-blueprint-muted mt-1">
                          {coach ? coach.full_name : "Coach TBC"} · {taken}/{session.capacity}{" "}
                          booked
                        </p>
                      </div>
                      {isFull && !bookingId ? (
                        <WaitlistPanel
                          sessionId={session.id}
                          entry={waitlistEntryBySession.get(session.id) ?? null}
                        />
                      ) : (
                        <BookingButton
                          sessionId={session.id}
                          bookingId={bookingId}
                          isFull={isFull}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
