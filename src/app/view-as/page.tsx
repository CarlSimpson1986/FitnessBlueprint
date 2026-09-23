import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ViewAsControls } from "@/components/TestAccountSwitcher";
import { OWNER_RETURN_COOKIE, type TestAccountKind } from "@/lib/test-accounts";

/**
 * The owner's "view as" screen: the app, signed in as a test coach or
 * member, running inside a phone-sized iframe so it renders at real phone
 * width. proxy.ts sends every top-level page load here while the owner is
 * in a test account (see src/app/admin/test-accounts/actions.ts).
 *
 * Deliberately doesn't use requireProfile(): a redirect to /login from
 * here would bounce straight back via the proxy. If the test session is
 * gone, the frame just shows /login and "Back to owner" still works.
 */
export default async function ViewAsPage({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  if (!(await cookies()).has(OWNER_RETURN_COOKIE)) {
    redirect("/admin");
  }

  const { path } = await searchParams;
  // Same-origin paths only — never frame an arbitrary URL.
  const framePath = path && path.startsWith("/") && !path.startsWith("//") ? path : "/";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const kind = (user?.app_metadata?.test_account as TestAccountKind | undefined) ?? null;
  const { data: profile } = user
    ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <main className="min-h-screen bg-blueprint-bg md:flex md:items-center md:justify-center md:gap-12 md:px-8 md:py-8">
      <aside className="px-4 py-3 md:p-0 md:w-64 md:order-2 border-b border-blueprint-line md:border-0">
        <p className="fb-eyebrow mb-1 hidden md:block">View as</p>
        <h1 className="text-lg md:text-xl font-semibold text-blueprint-ink mb-1 hidden md:block">
          {profile?.full_name ?? "Test account"}
        </h1>
        <p className="text-xs text-blueprint-muted leading-relaxed mb-4 hidden md:block">
          A real {kind ?? "test"} account, so it sees exactly what a {kind ?? "user"} would — no more, no less.
          Anything you do here (bookings, logs) really happens on that test account.
        </p>
        <ViewAsControls current={kind} />
      </aside>

      <div className="md:order-1 md:shrink-0 md:rounded-[3rem] md:border-[10px] md:border-neutral-800 md:bg-black md:shadow-2xl md:overflow-hidden">
        <iframe
          src={framePath}
          title="App preview"
          className="block w-full h-[calc(100vh-120px)] md:w-[390px] md:h-[min(844px,calc(100vh-80px))] bg-blueprint-bg"
        />
      </div>
    </main>
  );
}
