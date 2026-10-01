import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { computeAtRisk } from "@/lib/at-risk";
import { computeProgrammeRows, finishingNotSpokenTo, followUpsDue } from "@/lib/conversions";
import { isInternalAddress } from "@/lib/email";

/**
 * The owner's Monday email: ONE list of who could do with a personal
 * message this week, most urgent first.
 *  1. Programme members in their final week nobody's spoken to yet.
 *  2. Finished a programme without converting — never spoken to (for a
 *     month), or their follow-up date has arrived (0037).
 *  3. Not training: 14+ days, nothing booked (src/lib/at-risk.ts).
 *  4. Training but not checking in — from FIRST_CHECKIN_DIGEST only: the
 *     Sunday check-in email never went out before 4 Oct 2026 (cron
 *     fault), so before then almost everyone would be listed.
 * Someone already in an earlier section isn't repeated in a later one.
 * Returns null when nobody's listed — no email that week.
 */
export const FIRST_CHECKIN_DIGEST = "2026-10-19";

type Item = { name: string; detail: string; phone: string | null };
type Section = { title: string; items: Item[]; compact?: boolean };

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function phoneLink(phone: string | null) {
  return phone
    ? ` · <a href="tel:${escapeHtml(phone.replace(/\s+/g, ""))}" style="color:#2e9bf0">${escapeHtml(phone)}</a>`
    : "";
}

function sectionHtml(section: Section) {
  if (section.compact) {
    return `<p style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#444">${section.title}</p>
  <p style="font-size:14px;line-height:1.6;color:#444;margin:0">${section.items.map((i) => escapeHtml(i.name)).join(", ")}</p>`;
  }
  return `<p style="font-size:16px;font-weight:600;margin:24px 0 8px">${section.title}</p>
  <ul style="font-size:15px;line-height:1.7;padding-left:20px;margin:0">
    ${section.items
      .map(
        (i) =>
          `<li><strong>${escapeHtml(i.name)}</strong> <span style="color:#666">— ${escapeHtml(i.detail)}</span>${phoneLink(i.phone)}</li>`
      )
      .join("\n    ")}
  </ul>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;display:inline-block;margin:0 8px 8px 0">${label}</a>`;
}

export async function buildMondayDigest(
  supabase: SupabaseClient<Database>,
  siteUrl: string,
  today = new Date()
): Promise<{ subject: string; html: (ownerFirstName: string) => string } | null> {
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(today);
  const [programmeRows, atRisk] = await Promise.all([computeProgrammeRows(supabase, today), computeAtRisk(supabase)]);

  const real = programmeRows.filter((r) => !(r.email && isInternalAddress(r.email)));
  const finishing = finishingNotSpokenTo(real);
  const followUps = followUpsDue(real, today);

  const listed = new Set([...finishing, ...followUps].map((r) => r.memberId));
  const notTraining = atRisk.notTraining.filter((r) => !listed.has(r.id));
  notTraining.forEach((r) => listed.add(r.id));
  const notCheckingIn =
    todayKey >= FIRST_CHECKIN_DIGEST ? atRisk.notCheckingIn.filter((r) => !listed.has(r.id)) : [];

  const sections: Section[] = [
    {
      title: "Final week — not spoken to about what's next",
      items: finishing.map((r) => ({
        name: r.name,
        detail: `${r.planName}, ${r.daysSinceEnd === 0 ? "last day today" : `${plural(-r.daysSinceEnd, "day")} left`}`,
        phone: r.phone,
      })),
    },
    {
      title: "Finished, didn't convert — follow up",
      items: followUps.map((r) => ({
        name: r.name,
        detail: `${r.planName}, ended ${plural(r.daysSinceEnd, "day")} ago${r.followUp?.note ? ` · "${r.followUp.note}"` : r.followUp ? "" : " · not spoken to yet"}`,
        phone: r.phone,
      })),
    },
    {
      title: "Not training — nothing booked",
      items: notTraining.map((r) => ({
        name: r.full_name,
        detail: `${r.plan}, ${r.daysAway === null ? "no sessions yet" : `last in ${plural(r.daysAway, "day")} ago`}`,
        phone: r.phone,
      })),
    },
    { title: "Training, but no check-in for 2 weeks", items: notCheckingIn.map((r) => ({ name: r.full_name, detail: "", phone: null })), compact: true },
  ].filter((s) => s.items.length > 0);

  if (sections.length === 0) return null;

  const total = sections.reduce((sum, s) => sum + s.items.length, 0);
  const programmeListed = finishing.length + followUps.length > 0;

  return {
    subject: `${plural(total, "member")} worth a message this week`,
    html: (ownerFirstName) =>
      `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <p style="font-size:16px;line-height:1.5;margin:0">Morning ${escapeHtml(ownerFirstName)} — here's who could do with a personal message this week.</p>
  ${sections.map(sectionHtml).join("\n  ")}
  <p style="margin:28px 0 20px">${programmeListed ? button(`${siteUrl}/owner/conversions`, "Note your chats") : ""}${button(`${siteUrl}/owner/at-risk`, "Open the at-risk list")}</p>
  <p style="font-size:13px;color:#666">Fitness Blueprint</p>
</div>`.trim(),
  };
}
