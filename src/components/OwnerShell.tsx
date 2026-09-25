"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/(member)/account/actions";

const NAV: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Overview",
    links: [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/today", label: "Today" },
    ],
  },
  {
    heading: "Programming",
    links: [
      { href: "/admin/program-calendar", label: "Program calendar" },
      { href: "/admin/workout-templates", label: "Workout templates" },
    ],
  },
  {
    heading: "Members",
    links: [
      { href: "/admin/members", label: "Members" },
      { href: "/admin/check-ins", label: "Check-ins" },
      { href: "/owner/at-risk", label: "At-risk" },
      { href: "/owner/conversions", label: "6-week conversions" },
      { href: "/admin/challenges", label: "Challenges" },
      { href: "/admin/events", label: "Events" },
    ],
  },
  {
    heading: "Coach Ted",
    links: [{ href: "/admin/ted-answers", label: "Ted's answers" }],
  },
  {
    heading: "Business",
    links: [
      { href: "/owner/income", label: "Income" },
      { href: "/owner/session-economics", label: "Session economics" },
      { href: "/owner/feedback", label: "Feedback" },
    ],
  },
];

/**
 * Desktop layout for the owner's side of the app (admin + owner routes):
 * a fixed sidebar and wide pages from the lg breakpoint up. Coaches and
 * members use the app on their phones, so they never get this; on a
 * phone the owner sees the same single-column pages as before (the
 * sidebar is hidden and each page's own "← Admin" link does the job).
 * The wider page width is the .owner-shell rule in globals.css.
 */
export function OwnerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  return (
    <div className="owner-shell">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-blueprint-line bg-blueprint-bg px-4 py-6 overflow-y-auto">
        <p className="fb-eyebrow px-2 mb-6">Fitness Blueprint</p>
        <nav className="flex-1 space-y-6">
          {NAV.map((group) => (
            <div key={group.heading}>
              <p className="px-2 mb-1 text-[11px] font-medium uppercase tracking-wide text-blueprint-muted/70">
                {group.heading}
              </p>
              <ul className="space-y-0.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={
                        "block rounded px-2 py-1.5 text-sm transition " +
                        (isActive(link.href)
                          ? "bg-blueprint-raised text-blueprint-ink"
                          : "text-blueprint-muted hover:text-blueprint-ink hover:bg-blueprint-raised/60")
                      }
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-blueprint-line pt-4 mt-6 space-y-1">
          <Link
            href="/account/settings"
            className="block rounded px-2 py-1.5 text-sm text-blueprint-muted hover:text-blueprint-ink transition"
          >
            Account settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left rounded px-2 py-1.5 text-sm text-blueprint-muted hover:text-red-400 transition"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="lg:pl-60">{children}</div>
    </div>
  );
}
