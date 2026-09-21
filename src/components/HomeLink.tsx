import Link from "next/link";

/**
 * Small Home icon in the top-right of every non-Home member screen —
 * mirrors where the "FITNESS BLUEPRINT" logo sits on Home itself. Home is
 * deliberately not a bottom-nav tab (see BottomNav.tsx), so this is the
 * only way back to it from Progress/Bookings/Coach Ted/Account.
 */
export function HomeLink() {
  return (
    <Link href="/" aria-label="Home" className="text-blueprint-muted hover:text-blueprint-accent transition">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width={20}
        height={20}
      >
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
      </svg>
    </Link>
  );
}
