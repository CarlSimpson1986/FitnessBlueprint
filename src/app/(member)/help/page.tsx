import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { CONTACT_EMAIL, FAQ } from "@/lib/faq";

/** Help & FAQs for members (src/lib/faq.ts — Coach Ted answers from the same text). */
export default async function HelpPage() {
  await requireProfile();

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex items-center justify-between mb-1">
          <Link href="/account" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
            ← Profile
          </Link>
          <HomeLink />
        </div>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-2">Help &amp; FAQs</h1>
        <p className="text-sm text-blueprint-muted mb-8">
          Can&apos;t find it here? Ask Coach Ted, tell your coach, or email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-blueprint-accent underline">
            Guy
          </a>
          .
        </p>

        <div className="space-y-8">
          {FAQ.map((section) => (
            <section key={section.title}>
              <p className="fb-eyebrow mb-3">{section.title}</p>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <details key={item.question} className="fb-card group">
                    <summary className="cursor-pointer list-none flex items-start justify-between gap-3 text-sm font-medium text-blueprint-ink">
                      {item.question}
                      <span className="text-blueprint-muted transition group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </summary>
                    <p className="text-sm text-blueprint-muted leading-relaxed mt-3">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
