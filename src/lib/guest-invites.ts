import { escapeHtml } from "@/lib/html";
import { formatSessionDate, formatSessionTime } from "@/lib/format";

/** Where guests are told to go, and who to message when a class is full (privacy page has the same). */
export const GYM_ADDRESS = "Unit 3 Goodchild Parkway, Berryfields, Aylesbury HP18 0PE";
export const GYM_PHONE = "07791 596759";

/** Unconfirmed guest invites lapse this long before the class (0050, = the cancellation window). */
export const GUEST_CONFIRM_HOURS = 3;

/**
 * Short health screen for guests (based on the standard PAR-Q). One "yes"
 * to any of them asks for a few words, which the coach sees (0050:
 * guest_details, Check-ins switch). Only whether any was a yes is stored.
 */
export const GUEST_HEALTH_QUESTIONS = [
  "Has a doctor ever said you have a heart condition, or that you should only do exercise they recommend?",
  "Do you get chest pain when you're active, or have you had chest pain in the last month when you weren't?",
  "Do you lose your balance because of dizziness, or have you ever lost consciousness?",
  "Do you have a bone, joint or muscle problem that exercise could make worse?",
  "Are you taking any medication for blood pressure or a heart condition?",
  "Are you pregnant, or have you had a baby in the last 6 months?",
  "Is there any other reason you shouldn't do physical activity?",
];

export function guestInviteEmailHtml(input: {
  guestName: string;
  inviterName: string;
  className: string;
  sessionDate: string;
  startTime: string;
  url: string;
}) {
  const guest = escapeHtml(input.guestName.split(" ")[0] ?? input.guestName);
  const inviter = escapeHtml(input.inviterName.split(" ")[0] ?? input.inviterName);
  const when = `${formatSessionDate(input.sessionDate)} at ${formatSessionTime(input.startTime)}`;
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <h1 style="font-size:22px;margin:0 0 16px">Hey ${guest} — ${inviter}'s invited you to train</h1>
  <p style="font-size:16px;line-height:1.5">${inviter} has booked you a free place at <strong>${escapeHtml(input.className)}</strong>, ${escapeHtml(when)}, with them at Fitness Blueprint.</p>
  <p style="font-size:16px;line-height:1.5">Tap below to confirm. It takes a minute: your phone number and a few quick health questions so the coach can look after you.</p>
  <p style="margin:28px 0">
    <a href="${input.url}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">Confirm my place</a>
  </p>
  <p style="font-size:13px;line-height:1.5;color:#666">Please confirm at least ${GUEST_CONFIRM_HOURS} hours before the class, or the place goes to someone else. Can't make it? The same link lets you say no.</p>
  <p style="font-size:13px;line-height:1.5;color:#666">${escapeHtml(GYM_ADDRESS)} · ${escapeHtml(GYM_PHONE)}</p>
</div>`.trim();
}
