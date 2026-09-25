import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";
import { fetchClassesByCoach, fetchTimeOff, formatRange, isOff } from "@/lib/time-off";
import { AddTimeOffForm, AssignCoverSelect, DeleteTimeOffButton } from "./TimeOffClient";

/**
 * Owner records coach holidays (coach_time_off, 0032 — "owner manages
 * coach time off"). Each entry lists the sessions that coach is down for
 * while they're off, with suggested cover: other coaches who teach that
 * class and aren't off that day.
 */
export default async function TimeOffPage() {
  const { supabase } = await requireOwner();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  const [{ data: coaches }, timeOff, classesByCoach, { data: classes }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("role", ["coach", "owner"]).order("full_name"),
    fetchTimeOff(supabase, todayKey, "9999-12-31"),
    fetchClassesByCoach(supabase),
    supabase.from("session_templates").select("id, name"),
  ]);
  const nameById = new Map((coaches ?? []).map((c) => [c.id, c.full_name]));
  const className = new Map((classes ?? []).map((c) => [c.id, c.name]));

  const { data: sessions } = timeOff.length
    ? await supabase
        .from("sessions")
        .select("id, coach_id, session_date, start_time, template_id")
        .eq("status", "scheduled")
        .gte("session_date", todayKey)
        .in("coach_id", [...new Set(timeOff.map((t) => t.coach_id))])
        .order("session_date")
        .order("start_time")
    : { data: [] };

  const needingCover = (t: (typeof timeOff)[number]) =>
    (sessions ?? []).filter((s) => s.coach_id === t.coach_id && s.session_date >= t.starts_on && s.session_date <= t.ends_on);

  // Everyone who could take a session: not its current coach and not off
  // that day — split into those who already teach the class and the rest.
  const coverFor = (session: { coach_id: string; session_date: string; template_id: string }) => {
    const free = (coaches ?? []).filter((c) => c.id !== session.coach_id && !isOff(timeOff, c.id, session.session_date));
    const teaches = (c: { id: string }) => classesByCoach.get(c.id)?.has(session.template_id) ?? false;
    return { suggested: free.filter(teaches), others: free.filter((c) => !teaches(c)) };
  };

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link href="/admin" className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6">
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Coach time off</h1>
        <p className="text-blueprint-muted mb-10 text-sm leading-relaxed">
          Holidays and days off. Each one lists the sessions that need cover — pick a coach from
          the dropdown to hand them the session. Suggested coaches already teach that class and are
          free that day. The dashboard shows who&apos;s off in the next two weeks, and the
          program calendar flags those sessions too.
        </p>

        <AddTimeOffForm coaches={coaches ?? []} />

        <p className="fb-eyebrow mb-3">Current and upcoming ({timeOff.length})</p>
        {timeOff.length === 0 ? (
          <p className="text-sm text-blueprint-muted">No time off booked.</p>
        ) : (
          <ul className="space-y-3">
            {timeOff.map((t) => {
              const clashes = needingCover(t);
              return (
                <li key={t.id} className="fb-card">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-blueprint-ink font-medium">
                        {nameById.get(t.coach_id) ?? "Coach"} · {formatRange(t.starts_on, t.ends_on)}
                      </p>
                      <p className="text-xs mt-1">
                        {t.note && <span className="text-blueprint-muted">{t.note} · </span>}
                        {clashes.length ? (
                          <span className="text-red-400">
                            {clashes.length} session{clashes.length === 1 ? "" : "s"} need{clashes.length === 1 ? "s" : ""} cover
                          </span>
                        ) : (
                          <span className="text-blueprint-muted">No sessions need cover</span>
                        )}
                      </p>
                    </div>
                    <DeleteTimeOffButton id={t.id} />
                  </div>
                  {clashes.length > 0 && (
                    <ul className="mt-3 space-y-1.5 border-t border-blueprint-line pt-3">
                      {clashes.map((s) => {
                        const cover = coverFor(s);
                        return (
                          <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
                            <Link href={`/admin/program-calendar/sessions/${s.id}/workout`} className="text-blueprint-ink hover:text-blueprint-accent">
                              {formatSessionDate(s.session_date)} · {formatSessionTime(s.start_time)} · {className.get(s.template_id) ?? "Session"}
                            </Link>
                            <span className="flex items-center gap-3">
                              <span className="text-xs text-blueprint-muted">
                                {cover.suggested.length
                                  ? `Suggested: ${cover.suggested.map((c) => c.full_name).join(", ")}`
                                  : "No other coach teaches this class yet"}
                              </span>
                              <AssignCoverSelect sessionId={s.id} suggested={cover.suggested} others={cover.others} />
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
