import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { HomeLink } from "@/components/HomeLink";

const REASON_LABEL: Record<string, string> = {
  monthly_reset: "Monthly reset",
  booking: "Booking",
  cancellation_refund: "Cancellation refund",
  manual_adjustment: "Manual adjustment",
  signup_bonus: "Signup bonus",
};

function formatPence(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default async function PurchasesPage() {
  const { supabase, user } = await requireProfile();

  const [{ data: memberships }, { data: ledgerRows }] = await Promise.all([
    supabase
      .from("member_memberships")
      .select("id, plan_id, status, started_at, current_period_end")
      .eq("member_id", user.id)
      .order("started_at", { ascending: false }),
    supabase
      .from("credit_ledger")
      .select("id, delta, reason, created_at")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const planIds = [...new Set((memberships ?? []).map((m) => m.plan_id))];
  const { data: plans } = planIds.length
    ? await supabase.from("membership_plans").select("id, name, price_pence, billing_type").in("id", planIds)
    : { data: [] };

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));

  return (
    <main className="min-h-screen px-5 py-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <Link href="/account" className="text-xs text-blueprint-muted hover:text-blueprint-accent">
            ← Profile
          </Link>
          <HomeLink />
        </div>
        <h1 className="text-2xl font-semibold text-blueprint-ink mt-2 mb-2">Purchases &amp; credits</h1>
        <p className="text-xs text-blueprint-muted mb-6">
          View-only — see the team in person to change your plan.
        </p>

        <p className="fb-eyebrow mb-2">Membership</p>
        {(memberships ?? []).length === 0 ? (
          <p className="text-blueprint-muted text-sm mb-6">No membership on file yet.</p>
        ) : (
          <ul className="space-y-2 mb-6">
            {(memberships ?? []).map((m) => {
              const plan = planById.get(m.plan_id);
              return (
                <li key={m.id} className="fb-card">
                  <div className="flex items-center justify-between">
                    <p className="text-blueprint-ink font-medium">{plan?.name ?? "Plan"}</p>
                    <span className="text-[10px] font-mono uppercase tracking-wide text-blueprint-muted">
                      {m.status}
                    </span>
                  </div>
                  {plan && (
                    <p className="text-xs text-blueprint-muted mt-1">
                      {formatPence(plan.price_pence)} · {plan.billing_type === "recurring" ? "recurring" : "one-off"}
                    </p>
                  )}
                  <p className="text-xs text-blueprint-muted mt-1">
                    Since {new Date(m.started_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {m.current_period_end &&
                      ` · renews ${new Date(m.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <p className="fb-eyebrow mb-2">Credit history</p>
        {(ledgerRows ?? []).length === 0 ? (
          <p className="text-blueprint-muted text-sm">No credit activity yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {(ledgerRows ?? []).map((row) => (
              <li key={row.id} className="flex items-center justify-between text-sm">
                <span className="text-blueprint-ink">{REASON_LABEL[row.reason] ?? row.reason}</span>
                <span className="flex items-center gap-3">
                  <span className={row.delta > 0 ? "text-blueprint-accent" : "text-blueprint-muted"}>
                    {row.delta > 0 ? "+" : ""}
                    {row.delta}
                  </span>
                  <span className="text-xs text-blueprint-dim">
                    {new Date(row.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
