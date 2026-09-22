import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatSessionDate, formatSessionTime } from "@/lib/format";

const RATING_LABELS = ["Class", "Effort", "Experience"] as const;

export default async function OwnerFeedbackPage() {
  const { supabase } = await requireOwner();

  const { data: feedbackRows } = await supabase
    .from("session_feedback")
    .select("id, session_id, member_id, class_rating, effort_rating, experience_rating, comment, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = feedbackRows ?? [];
  const sessionIds = Array.from(new Set(rows.map((r) => r.session_id)));
  const memberIds = Array.from(new Set(rows.map((r) => r.member_id)));

  const [{ data: sessions }, { data: members }] = await Promise.all([
    sessionIds.length
      ? supabase.from("sessions").select("id, session_date, start_time, template_id").in("id", sessionIds)
      : Promise.resolve({ data: [] }),
    memberIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", memberIds)
      : Promise.resolve({ data: [] }),
  ]);

  const sessionRows = sessions ?? [];
  const templateIds = Array.from(new Set(sessionRows.map((s) => s.template_id)));
  const { data: templates } = templateIds.length
    ? await supabase.from("session_templates").select("id, name").in("id", templateIds)
    : { data: [] };

  const sessionById = new Map(sessionRows.map((s) => [s.id, s]));
  const templateById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const memberById = new Map((members ?? []).map((m) => [m.id, m.full_name]));

  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">
          Owner
        </p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Session feedback</h1>
        <p className="text-xs text-blueprint-muted mb-10">
          Private to you — coaches and members can&apos;t see this.
        </p>

        {rows.length === 0 ? (
          <p className="text-blueprint-muted text-sm">No feedback submitted yet.</p>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => {
              const session = sessionById.get(row.session_id);
              const templateName = session ? templateById.get(session.template_id) : null;
              const memberName = memberById.get(row.member_id) ?? "Unknown member";
              const ratings = [row.class_rating, row.effort_rating, row.experience_rating];

              return (
                <li
                  key={row.id}
                  className="border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-4"
                >
                  <p className="text-blueprint-ink font-medium">
                    {memberName}
                    {session && (
                      <span className="text-blueprint-muted font-normal">
                        {" "}
                        · {formatSessionDate(session.session_date)}{" "}
                        {formatSessionTime(session.start_time)} · {templateName ?? "Session"}
                      </span>
                    )}
                  </p>

                  <div className="flex gap-4 mt-2">
                    {RATING_LABELS.map((label, i) => (
                      <span key={label} className="text-xs text-blueprint-muted">
                        {label}: <span className="text-blueprint-ink">{ratings[i]}/5</span>
                      </span>
                    ))}
                  </div>

                  {row.comment && (
                    <p className="text-sm text-blueprint-ink mt-3 leading-relaxed">{row.comment}</p>
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
