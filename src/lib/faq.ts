import { BOOKING_WINDOW_DAYS } from "@/lib/booking-window";
import { GUEST_CONFIRM_HOURS } from "@/lib/guest-invites";

/**
 * Help & FAQs — one source for the member Help page (/help) and Coach
 * Ted's "how the app works" instructions (claude.ts), so Ted answers app
 * questions from the same text instead of guessing. On 2026-10-05 Ted
 * answered "how do I cancel?" with "ask your coach" and then water advice.
 *
 * Written from a new member's walk through the app (Carl, 2026-10-05).
 * Keep answers short, plain and true to how the app actually works; if a
 * rule changes (cancellation window, guest passes, Ted's limit), change
 * it here too. Answers marked guyToConfirm are Guy's policy, not app
 * behaviour — listed for Carl to check with him.
 */

export type FaqItem = {
  question: string;
  answer: string;
  /** Gym policy Guy should confirm before members rely on it. */
  guyToConfirm?: boolean;
};

export type FaqSection = { title: string; items: FaqItem[] };

export const CONTACT_EMAIL = "fitnessblueprintaylesbury@gmail.com";

/** Must match DAILY_QUESTION_LIMIT in src/app/api/coach-ted/route.ts (enforced in 0039). */
const TED_DAILY_LIMIT = 20;

export const FAQ: FaqSection[] = [
  {
    title: "Getting started",
    items: [
      {
        question: "How do I put the app on my phone?",
        answer:
          "Tap Get app at the bottom of the screen and follow the steps. On iPhone: open the app in Safari, tap the Share button, then Add to Home Screen. On Android: open the browser menu (⋮) and tap Install app or Add to Home screen. It then opens like any other app.",
      },
      {
        question: "How do I sign in?",
        answer:
          "With your email and password, or tap \"Email me a sign-in link instead\" on the sign-in page and use the link we send you. If you forget your password, the link always works.",
      },
      {
        question: "Can I see the tour again?",
        answer: "Yes: Profile, then Show me round again.",
      },
    ],
  },
  {
    title: "Booking",
    items: [
      {
        question: "How do I book a class?",
        answer: `My bookings, then Schedule, then Book next to the class. Classes open ${BOOKING_WINDOW_DAYS / 7} weeks ahead. Your booked classes show under My bookings and on your home screen.`,
      },
      {
        question: "How do I cancel, and do I lose anything?",
        answer:
          "In My bookings, open Schedule and tap Cancel next to the class. Cancel at least 3 hours before it starts and your credit comes back. Inside 3 hours you lose the credit (on a weekly plan, that week's place). If something came up, message your coach: they can excuse it and give the credit back.",
      },
      {
        question: "Can I see the workout before I book?",
        answer:
          "Not yet: tapping a class in Schedule doesn't show the workout. On the day, open the class from your home screen and tap Start session to see the full workout.",
      },
      {
        question: "The class is full. What now?",
        answer:
          "Tap Join waitlist. If a place opens up we'll email you and you'll have 2 hours to accept it in the app, otherwise it goes to the next person.",
      },
      {
        question: "How many classes can I book?",
        answer:
          "It depends on your plan. Weekly plans (for example 2x per week) cover that many classes each Monday to Sunday week; the top of My bookings shows how many you've used. Packs and drop-ins use one credit per class.",
      },
      {
        question: "Do my credits run out?",
        answer:
          "You can see your credits and plan under Profile, then Purchases & credits. Ask Guy how long pack credits last.",
        guyToConfirm: true,
      },
      {
        question: "Can I bring a friend?",
        answer: `Yes, once a month for free. Once you've booked, tap Bring a friend free under the class in Schedule and add their name and email. They get an email to confirm and fill in a short health form, at least ${GUEST_CONFIRM_HOURS} hours before the class. If they join the gym, you get another pass that month.`,
      },
      {
        question: "Can I add my classes to my calendar?",
        answer:
          "Yes: Profile, Account settings, Add to your calendar. Your bookings then appear in your phone's calendar and update by themselves.",
      },
    ],
  },
  {
    title: "On the day",
    items: [
      {
        question: "What's the check-in before class?",
        answer:
          "A few taps on how you're feeling, how you slept and any pain or niggles. Your coach sees it before the class, so they can adjust things for you.",
      },
      {
        question: "How do I log my workout?",
        answer:
          "In class, open the session from your home screen and tap Start session. Type your weights and reps as you go and tap Finish section to move on; tap Edit on a finished section to fix anything. Warm-ups and cool-downs have nothing to log. Tap Finish workout at the end.",
      },
      {
        question: "Does the app connect to my watch, Apple Health or MyFitnessPal?",
        answer:
          "No, it doesn't connect to watches, fitness trackers, Apple Health or food apps. You log your weights and reps in class, and your habits on the Progress tab.",
      },
      {
        question: "Why should I rate the class?",
        answer:
          "It takes about ten seconds and only Guy sees your individual ratings. It's how he knows what's working.",
      },
      {
        question: "Can I change the daily habits on Progress?",
        answer:
          "No, that list is set by the gym, so just tick the ones you did each day. Your own habits are part of your goal: you choose them when you set your goal with Coach Ted (Profile, then Goals).",
      },
      {
        question: "What's the Sunday check-in?",
        answer:
          "Every Sunday Coach Ted asks how your week went: energy, sleep, food, your win and what got in the way. It takes a minute and helps your coach and Ted help you.",
      },
    ],
  },
  {
    title: "Coach Ted",
    items: [
      {
        question: "What can Coach Ted help with?",
        answer:
          "Training, exercise technique, nutrition, sleep, recovery and habits. He knows your goals and check-ins, and bases research claims on real studies. He isn't medical advice: for pain, injury or health worries, see your GP or physio.",
      },
      {
        question: "Is there a limit?",
        answer: `${TED_DAILY_LIMIT} questions a day. If you hit it, ask again tomorrow or ask your coach.`,
      },
    ],
  },
  {
    title: "Your account and data",
    items: [
      {
        question: "How do I change, pause or cancel my membership?",
        answer: "Speak to Guy or the team at the gym. The app shows your plan but can't change it.",
        guyToConfirm: true,
      },
      {
        question: "Can I turn off health tracking?",
        answer:
          "Yes: Profile, Account settings, Health info. With it off, Coach Ted and the check-ins aren't available, because they rely on it.",
      },
      {
        question: "Who can see my information?",
        answer:
          "Guy sees everything. Coaches see what they need to coach you, such as who's booked and, if Guy allows it, your check-ins. The full details are in the Privacy notice under Profile.",
      },
      {
        question: "Something's not working. Who do I tell?",
        answer: `Tell your coach, or email Guy at ${CONTACT_EMAIL}.`,
      },
    ],
  },
];

/** Plain-text version for Ted's instructions. No email address: Ted's answer check removes links. */
export function faqForTed(): string {
  return FAQ.map(
    (section) =>
      `${section.title}:\n` +
      section.items
        .map((item) => `- ${item.question} ${item.answer.replace(`email Guy at ${CONTACT_EMAIL}`, "message Guy (his email is on the Help page)")}`)
        .join("\n")
  ).join("\n\n");
}
