"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstallAppTab } from "./InstallAppTab";

const TABS = [
  {
    href: "/sessions",
    label: "My bookings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="M9 15l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/coach-ted",
    label: "Coach Ted",
    icon: (
      <Image
        src="/coach-ted.png"
        alt=""
        width={24}
        height={24}
        className="rounded-full object-cover"
      />
    ),
  },
  {
    href: "/progress",
    label: "Progress",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
        <path d="M4 19h16" />
        <path d="M4 15l4-5 4 3 6-8" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex justify-around items-center bg-blueprint-bg border-t border-blueprint-line pt-2"
      style={{ paddingBottom: "max(0.6rem, env(safe-area-inset-bottom))" }}
    >
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            data-tour={tab.href}
            className={`flex flex-col items-center gap-1 px-3 ${
              isActive ? "text-blueprint-accent" : "text-blueprint-ink"
            }`}
          >
            {tab.href === "/coach-ted" ? (
              <span
                className="rounded-full"
                style={{
                  border: `2px solid ${isActive ? "var(--fb-accent)" : "transparent"}`,
                  lineHeight: 0,
                }}
              >
                {tab.icon}
              </span>
            ) : (
              tab.icon
            )}
            <span className="text-[10px]">{tab.label}</span>
          </Link>
        );
      })}
      <InstallAppTab />
    </nav>
  );
}
