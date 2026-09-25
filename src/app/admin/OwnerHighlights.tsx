import Link from "next/link";
import type { fetchOwnerHighlights } from "@/lib/owner-highlights";
import { formatRange } from "@/lib/time-off";

type Highlights = Awaited<ReturnType<typeof fetchOwnerHighlights>>;

function Tile({ href, label, value, detail, tone = "default" }: {
  href: string;
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "warn";
}) {
  return (
    <Link href={href} className="fb-card block h-full hover:border-blueprint-accent transition">
      <p className="text-[11px] font-medium uppercase tracking-wide text-blueprint-muted">{label}</p>
      <p className={"text-2xl font-semibold mt-1 " + (tone === "warn" ? "text-red-400" : "text-blueprint-ink")}>{value}</p>
      {detail && <p className="text-xs text-blueprint-muted mt-1 leading-relaxed">{detail}</p>}
    </Link>
  );
}

const names = (list: { name: string }[], max = 3) =>
  list.length === 0 ? undefined : list.slice(0, max).map((p) => p.name).join(", ") + (list.length > max ? ` +${list.length - max} more` : "");

/** Headline tiles at the top of the owner dashboard (src/lib/owner-highlights.ts). */
export function OwnerHighlights({ data }: { data: Highlights }) {
  const coverNeeded = data.coachesOff.reduce((sum, c) => sum + c.needsCover, 0);
  const weekPct = data.week.capacity ? Math.round((data.week.booked / data.week.capacity) * 100) : 0;
  return (
    <section className="mb-10 space-y-6">
      <div>
        <p className="fb-eyebrow mb-3">Classes &amp; coaches</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            href="/owner/session-economics"
            label="This week"
            value={`${weekPct}% full`}
            detail={`${data.week.booked} of ${data.week.capacity} spots booked across ${data.week.sessions} sessions`}
          />
          <Tile
            href="/owner/session-economics"
            label="Most popular slot (4 weeks)"
            value={data.busiest ? `${data.busiest.fillPct}% full` : "—"}
            detail={data.busiest?.label ?? "No sessions in the last 4 weeks yet"}
          />
          <Tile
            href="/owner/session-economics"
            label="Quietest slot (4 weeks)"
            value={data.quietest ? `${data.quietest.fillPct}% full` : "—"}
            detail={data.quietest?.label ?? "Needs at least two regular slots"}
          />
          <Tile
            href="/admin/time-off"
            label="Coaches off (2 weeks)"
            value={String(data.coachesOff.length)}
            tone={coverNeeded ? "warn" : "default"}
            detail={
              data.coachesOff.length
                ? data.coachesOff
                    .slice(0, 3)
                    .map((c) => `${c.name} ${formatRange(c.startsOn, c.endsOn)}`)
                    .join(", ") + (coverNeeded ? ` · ${coverNeeded} session${coverNeeded === 1 ? "" : "s"} need cover` : "")
                : "No one's off in the next two weeks"
            }
          />
        </div>
      </div>
      <div>
        <p className="fb-eyebrow mb-3">Members</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            href="/owner/at-risk"
            label="Slipping away"
            value={String(data.slipping.length)}
            tone={data.slipping.length ? "warn" : "default"}
            detail={names(data.slipping) ?? "Everyone on a plan is training or booked in"}
          />
          <Tile
            href="/owner/at-risk"
            label="Not checking in (2 weeks)"
            value={String(data.notCheckingIn)}
            detail="Still training, but no check-in or measurements"
          />
          <Tile
            href="/owner/conversions"
            label="6-week finishing this week"
            value={String(data.endingSoon.length)}
            detail={
              data.endingSoon.length
                ? data.endingSoon.slice(0, 3).map((m) => `${m.name} (${m.daysLeft === 0 ? "today" : `${m.daysLeft}d`})`).join(", ")
                : "No programmes ending in the next 7 days"
            }
          />
        </div>
      </div>
    </section>
  );
}
