"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "@/app/(member)/account/actions";

type NavLink = { href: string; label: string };

// Each section is itself a page (its main one) with sub-pages beneath it.
const NAV: (NavLink & { children: NavLink[] })[] = [
  { href: "/admin", label: "Dashboard", children: [{ href: "/admin/today", label: "Today" }] },
  {
    href: "/admin/program-calendar",
    label: "Programming",
    children: [
      { href: "/admin/workout-templates", label: "Workout templates" },
      { href: "/admin/time-off", label: "Coach time off" },
    ],
  },
  {
    href: "/admin/members",
    label: "Members",
    children: [
      { href: "/admin/check-ins", label: "Check-ins" },
      { href: "/owner/at-risk", label: "At-risk" },
      { href: "/owner/conversions", label: "6-week conversions" },
      { href: "/admin/challenges", label: "Challenges" },
      { href: "/admin/events", label: "Events" },
    ],
  },
  { href: "/admin/ted-answers", label: "Coach Ted", children: [] },
  {
    href: "/owner/income",
    label: "Business",
    children: [
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
  // A section is open if the owner toggled it, otherwise if they're on
  // one of its pages — so navigating always reveals where you are.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (section: (typeof NAV)[number]) =>
    toggled[section.href] ?? [section, ...section.children].some((l) => isActive(l.href));

  const linkClass = (active: boolean) =>
    "block rounded px-2 py-1.5 text-sm transition " +
    (active ? "bg-blueprint-raised text-blueprint-ink" : "text-blueprint-muted hover:text-blueprint-ink hover:bg-blueprint-raised/60");

  return (
    <div className="owner-shell">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-blueprint-line bg-blueprint-bg px-4 py-6 overflow-y-auto">
        <p className="fb-eyebrow px-2 mb-6">Fitness Blueprint</p>
        <nav className="flex-1 space-y-1">
          {NAV.map((section) => {
            const open = isOpen(section);
            return (
              <div key={section.href}>
                <div className="flex items-center">
                  <Link href={section.href} className={"flex-1 font-medium " + linkClass(isActive(section.href))}>
                    {section.label}
                  </Link>
                  {section.children.length > 0 && (
                    <button
                      type="button"
                      aria-label={`${open ? "Collapse" : "Expand"} ${section.label}`}
                      aria-expanded={open}
                      onClick={() => setToggled((t) => ({ ...t, [section.href]: !open }))}
                      className="ml-1 rounded p-1.5 text-blueprint-muted hover:text-blueprint-ink hover:bg-blueprint-raised/60 transition"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className={"transition-transform " + (open ? "rotate-90" : "")}>
                        <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
                {open && section.children.length > 0 && (
                  <ul className="mt-0.5 mb-2 ml-3 border-l border-blueprint-line pl-2 space-y-0.5">
                    {section.children.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className={linkClass(isActive(link.href))}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
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
