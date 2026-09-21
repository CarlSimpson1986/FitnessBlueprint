import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";
import { signOut } from "./actions";

function MenuRow({ href, label, hint }: { href: string; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="fb-card flex items-center justify-between hover:border-blueprint-accent transition"
    >
      <span className="text-blueprint-ink font-medium">{label}</span>
      <span className="text-blueprint-muted text-sm">{hint ?? "→"}</span>
    </Link>
  );
}

export default async function AccountPage() {
  const { profile } = await requireProfile();

  const initial = profile.full_name.trim().charAt(0).toUpperCase() || "?";
  const memberSince = new Date(profile.created_at).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-md mx-auto">
        <div className="flex items-start justify-between mb-6">
          <p className="fb-eyebrow">Fitness Blueprint</p>
          <HomeLink />
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-semibold text-blueprint-bg shrink-0"
            style={{ backgroundColor: "var(--fb-accent)" }}
          >
            {initial}
          </div>
          <div>
            <p className="text-lg font-semibold text-blueprint-ink">{profile.full_name}</p>
            <p className="text-xs text-blueprint-muted">Member since {memberSince}</p>
          </div>
        </div>

        <div className="space-y-2">
          {(profile.role === "owner" || profile.role === "coach") && (
            <MenuRow href="/admin" label="Admin" hint="Manage sessions & members →" />
          )}
          <MenuRow href="/goals" label="Goals" />
          <MenuRow href="/account/settings" label="Account settings" />
          <MenuRow href="/account/purchases" label="Purchases & credits" />
        </div>

        <form action={signOut} className="mt-6">
          <button type="submit" className="fb-btn-secondary w-full">
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
