import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Privacy — Fitness Blueprint",
};

// Public page: no auth check. Facts here (controller, contact, retention)
// match the gym's website policy at fitnessblueprint.co.uk/privacy-policy —
// change both together. Bump LAST_UPDATED on any change.
const LAST_UPDATED = "3 October 2026";
const CONTACT_EMAIL = "fitnessblueprintaylesbury@gmail.com";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-blueprint-ink mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-blueprint-muted leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <p className="fb-eyebrow mb-1">Fitness Blueprint</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Privacy notice for the app</h1>
        <p className="text-xs font-mono uppercase tracking-wide text-blueprint-muted">
          Last updated {LAST_UPDATED}
        </p>

        <Section title="Who we are">
          <p>
            Fitness Blueprint Ltd (&ldquo;we&rdquo;) runs this app and is the data controller for the
            information in it. We are registered with the Information Commissioner&rsquo;s Office (ICO).
          </p>
          <p>
            Unit 3 Goodchild Parkway, Berryfields, Aylesbury HP18 0PE.
            <br />
            Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blueprint-accent underline">
              {CONTACT_EMAIL}
            </a>{" "}
            · Phone 07791 596759
          </p>
          <p>
            This notice covers the app. Our wider policy, covering the gym, events and our website, is
            at{" "}
            <a
              href="https://fitnessblueprint.co.uk/privacy-policy"
              className="text-blueprint-accent underline"
            >
              fitnessblueprint.co.uk/privacy-policy
            </a>
            .
          </p>
        </Section>

        <Section title="What we hold about you">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-blueprint-ink">Account details:</strong> name, email, phone number
              and emergency contact.
            </li>
            <li>
              <strong className="text-blueprint-ink">Membership and bookings:</strong> your plan,
              purchases, credits, the sessions you book, cancel and attend.
            </li>
            <li>
              <strong className="text-blueprint-ink">Health and fitness information:</strong> weigh-ins,
              goals, workout logs, readiness and weekly check-ins (including how you rate your sleep,
              energy, stress and any pain or injury), habits, and session feedback.
            </li>
            <li>
              <strong className="text-blueprint-ink">Coach Ted:</strong> the questions you ask our AI
              coach and its answers.
            </li>
            <li>
              <strong className="text-blueprint-ink">Payments:</strong> handled by Stripe and GoCardless.
              We see what you bought and when, never your full card or bank details.
            </li>
          </ul>
        </Section>

        <Section title="Why we use it">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              To run your membership: bookings, reminders and payments. This is necessary for our
              contract with you.
            </li>
            <li>
              To coach you safely and well, including spotting when you might need a check-in from us.
              This is in our legitimate interests and yours.
            </li>
            <li>
              Health and fitness information is a special category of data under UK law. We only use it
              because you choose to give it to us for coaching, and you can stop at any time. Leaving
              check-ins blank, or not using Coach Ted, does not affect your membership.
            </li>
          </ul>
          <p>We never sell your data and we do not use it for advertising.</p>
        </Section>

        <Section title="Who can see it">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-blueprint-ink">Guy (owner and head coach)</strong> can see
              everything in the app, including individual session ratings.
            </li>
            <li>
              <strong className="text-blueprint-ink">Our coaches</strong> see what they need to coach
              you: who is booked on their sessions and attendance, and, where Guy has allowed it, your
              check-ins. Coaches do not see your individual session ratings.
            </li>
            <li>Other members never see your information.</li>
          </ul>
        </Section>

        <Section title="Services that process it for us">
          <p>These companies handle data on our behalf and only as we instruct:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Supabase: stores the app&rsquo;s database and handles sign-in.</li>
            <li>Vercel: hosts the app.</li>
            <li>Stripe and GoCardless: take payments.</li>
            <li>Brevo: sends the app&rsquo;s emails (booking reminders, sign-in links).</li>
            <li>
              Anthropic (Claude): writes Coach Ted&rsquo;s answers. Ted is given your question plus a
              summary of your goals, recent training and check-ins so its answer fits you.
            </li>
            <li>
              Google (Gemini): used to match your question to similar questions Ted has already answered.
            </li>
            <li>
              PubMed (US National Library of Medicine): Ted may search it for research. Only search words
              are sent, never your name or details.
            </li>
          </ul>
          <p>
            Some of these companies store or process data outside the UK. Where they do, they use
            safeguards approved under UK law, such as the UK International Data Transfer Addendum.
          </p>
          <p>
            Coach Ted is an AI and can be wrong. It is not medical advice: speak to a GP or physio about
            pain, injury or health conditions.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Coaching records, including health and fitness information, are kept for up to 7 years after
            your membership ends, in line with our insurance requirements, then deleted. Email logs
            and Coach Ted conversations are deleted when your account is deleted. You can ask us to
            delete your account at any time.
          </p>
        </Section>

        <Section title="Under 18s">
          <p>
            Members under 18 need a parent or guardian&rsquo;s consent, and the parent or guardian can
            make requests on their behalf.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can ask to see a copy of your data, correct it, delete it, restrict or object to how we
            use it, or withdraw your consent. Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-blueprint-accent underline">
              {CONTACT_EMAIL}
            </a>{" "}
            and we will reply within one month.
          </p>
          <p>
            If you are unhappy with how we have handled your data, please tell us first. You can also
            complain to the ICO at{" "}
            <a href="https://ico.org.uk/make-a-complaint/" className="text-blueprint-accent underline">
              ico.org.uk
            </a>{" "}
            or on 0303 123 1113.
          </p>
        </Section>

        <Link
          href="/"
          className="mt-12 inline-block text-xs font-mono uppercase tracking-wide text-blueprint-muted hover:text-blueprint-accent transition"
        >
          ← Back to the app
        </Link>
      </div>
    </main>
  );
}
