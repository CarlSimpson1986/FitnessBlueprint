/**
 * Last check on a finished Coach Ted answer, in code rather than the
 * prompt: any phone number or link that isn't on the approved list is
 * removed. Ted's prompt already forbids them (a made-up crisis number is
 * worse than none — he once invented a Shout number), but a prompt is a
 * request, and this makes it a rule.
 *
 * Keep the lists in step with the numbers and links in TED_SYSTEM_PROMPT
 * (src/lib/coach-ted/claude.ts).
 */

/** Digits only. */
const ALLOWED_NUMBERS = new Set(["999", "111", "116123", "85258"]);

/** Hosts (and their subdomains) Ted may link to. */
const ALLOWED_HOSTS = ["beateatingdisorders.org.uk", "pubmed.ncbi.nlm.nih.gov", "nhs.uk"];

export const SAFE_NUMBERS_FOOTER =
  "If you need help now: 999 in an emergency, NHS 111 for urgent medical advice, or Samaritans on 116 123 (free, any time).";

const REMOVED_NUMBER = "[number removed]";
const REMOVED_LINK = "[link removed]";

// A link with a scheme or www., or a bare domain with a common ending.
const LINK = /\b(?:https?:\/\/|www\.)[^\s)<>"']+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|org|net|io|info|co\.uk|org\.uk|uk|gov|nhs\.uk)\b(?:\/[^\s)<>"']*)?/gi;

// UK numbers (07…, 01…, 0800…, +44…) and US style 1-800-…
const LONG_PHONE = /(?:\+44\s?|\b0)\d(?:[\s-]?\d){8,9}\b|\b1[-\s]?\d{3}[-\s]?\d{3}[-\s]?\d{4}\b/g;

// Short numbers only count as phone numbers after a calling word, so
// "2000-2500 calories" or "75kg x 3" never trip it. The gap allows a few
// words ("text SHOUT to 85258") but no digits or sentence end.
const SHORT_PHONE = /\b(call|ring|phone|dial|text|txt|contact)\b([^\d\n.!?]{0,25}?)(\d[\d\s]{1,8}\d)\b/gi;

function hostAllowed(link: string, extraHosts: string[]) {
  const host = link
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#]/)[0]!
    .toLowerCase();
  return [...ALLOWED_HOSTS, ...extraHosts].some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export type AnswerCheck = { text: string; removed: string[] };

/**
 * extraHosts: hosts Ted was legitimately given this time (the PubMed
 * articles in his context), so citing one isn't removed.
 */
export function checkTedAnswer(answer: string, extraHosts: string[] = []): AnswerCheck {
  const removed: string[] = [];
  let removedNumber = false;

  let text = answer.replace(LINK, (link) => {
    if (hostAllowed(link, extraHosts)) return link;
    removed.push(link);
    return REMOVED_LINK;
  });

  text = text.replace(LONG_PHONE, (number) => {
    if (ALLOWED_NUMBERS.has(number.replace(/\D/g, ""))) return number;
    removed.push(number);
    removedNumber = true;
    return REMOVED_NUMBER;
  });

  text = text.replace(SHORT_PHONE, (match, verb: string, gap: string, number: string) => {
    if (ALLOWED_NUMBERS.has(number.replace(/\D/g, ""))) return match;
    removed.push(number);
    removedNumber = true;
    return `${verb}${gap}${REMOVED_NUMBER}`;
  });

  if (removedNumber && !text.includes(SAFE_NUMBERS_FOOTER)) {
    text = `${text.trimEnd()}\n\n${SAFE_NUMBERS_FOOTER}`;
  }

  return { text, removed };
}

/**
 * Sent after the streamed answer when the check changed it: everything
 * after this marker replaces what was streamed (TedChat does the swap).
 * A control character the model never writes.
 */
export const ANSWER_REPLACED_MARKER = "\u001e";
