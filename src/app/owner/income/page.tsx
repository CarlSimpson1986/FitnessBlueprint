import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { fetchGoCardlessIncome, fetchStripeIncome, type IncomeTransaction } from "@/lib/income";
import { resolvePeriod } from "@/lib/period";
import { PeriodPicker } from "@/components/PeriodPicker";
import { DonutChart } from "@/components/DonutChart";

function formatPence(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; value?: string }>;
}) {
  const { supabase } = await requireOwner();
  const params = await searchParams;
  const { start, end, label, unit, value } = resolvePeriod(params);

  const [stripe, gocardless, { data: plans }] = await Promise.all([
    fetchStripeIncome(start, end),
    fetchGoCardlessIncome(start, end),
    supabase.from("membership_plans").select("name, price_pence"),
  ]);

  // When the provider doesn't say what was bought, an amount that matches
  // exactly one plan's price is a safe guess; anything else is "Other".
  const planNamesByPrice = new Map<number, string[]>();
  for (const plan of plans ?? []) {
    planNamesByPrice.set(plan.price_pence, [...(planNamesByPrice.get(plan.price_pence) ?? []), plan.name]);
  }
  function productOf(t: IncomeTransaction) {
    if (t.product) return t.product;
    const matches = planNamesByPrice.get(t.amountPence);
    return (matches?.length === 1 && matches[0]) || "Other";
  }

  const combinedTotal = stripe.totalPence + gocardless.totalPence;
  const allTransactions: IncomeTransaction[] = [...stripe.transactions, ...gocardless.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const byProductMap = new Map<string, { totalPence: number; count: number }>();
  for (const t of allTransactions) {
    const key = productOf(t);
    const entry = byProductMap.get(key) ?? { totalPence: 0, count: 0 };
    entry.totalPence += t.amountPence;
    entry.count += 1;
    byProductMap.set(key, entry);
  }
  const byProduct = [...byProductMap.entries()]
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.totalPence - a.totalPence);
  const topProductPence = byProduct[0]?.totalPence ?? 0;

  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/admin"
          className="inline-block font-mono text-xs tracking-wide text-blueprint-muted hover:text-blueprint-accent transition mb-6"
        >
          ← Admin
        </Link>
        <p className="fb-eyebrow mb-1">Owner</p>
        <h1 className="text-2xl font-semibold text-blueprint-ink mb-2">Income</h1>
        <p className="text-blueprint-muted mb-6 text-sm leading-relaxed">
          Read-only — pulled live from Stripe and GoCardless, nothing purchased or collected here.
          Private to you.
        </p>

        <PeriodPicker unit={unit} value={value} />
        <p className="text-xs text-blueprint-muted -mt-6 mb-8">{label}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="fb-card-accent text-center">
            <p className="text-2xl font-semibold text-blueprint-ink">{formatPence(combinedTotal)}</p>
            <p className="text-xs text-blueprint-muted mt-1">Total income</p>
          </div>
          <div className="fb-card text-center">
            <p className="text-lg font-semibold text-blueprint-ink">
              {stripe.configured ? formatPence(stripe.totalPence) : "—"}
            </p>
            <p className="text-xs text-blueprint-muted mt-1">
              Stripe {!stripe.configured && "(not configured)"}
              {stripe.error && <span className="block text-red-400 mt-1">{stripe.error}</span>}
            </p>
          </div>
          <div className="fb-card text-center">
            <p className="text-lg font-semibold text-blueprint-ink">
              {gocardless.configured ? formatPence(gocardless.totalPence) : "—"}
            </p>
            <p className="text-xs text-blueprint-muted mt-1">
              GoCardless {!gocardless.configured && "(not configured)"}
              {gocardless.error && <span className="block text-red-400 mt-1">{gocardless.error}</span>}
            </p>
          </div>
        </div>

        {combinedTotal > 0 && (
          <div className="fb-card mb-10">
            <DonutChart
              centerLabel="Total income"
              centerValue={formatPence(combinedTotal)}
              valueFormat="pence"
              segments={[
                { label: "Stripe", value: stripe.totalPence, color: "var(--fb-series-1)" },
                { label: "GoCardless", value: gocardless.totalPence, color: "var(--fb-series-2)" },
              ]}
            />
          </div>
        )}

        {byProduct.length > 0 && (
          <div className="mb-10">
            <p className="fb-eyebrow mb-3">By product ({byProduct.length})</p>
            <ul className="fb-card space-y-3">
              {byProduct.map((p) => (
                <li key={p.name}>
                  <div className="flex items-baseline justify-between gap-4 text-sm mb-1">
                    <span className="text-blueprint-ink truncate">{p.name}</span>
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="text-blueprint-ink font-medium">{formatPence(p.totalPence)}</span>
                      <span className="text-blueprint-muted text-xs">
                        {" "}
                        · {p.count} payment{p.count === 1 ? "" : "s"} ·{" "}
                        {combinedTotal > 0 ? Math.round((p.totalPence / combinedTotal) * 100) : 0}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-blueprint-line/50 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${topProductPence > 0 ? (p.totalPence / topProductPence) * 100 : 0}%`,
                        backgroundColor: "var(--fb-series-1)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="fb-eyebrow mb-3">Transactions ({allTransactions.length})</p>
        {allTransactions.length === 0 ? (
          <p className="text-blueprint-muted text-sm">No transactions for {label}.</p>
        ) : (
          <ul className="space-y-1.5">
            {allTransactions.map((t) => (
              <li
                key={`${t.provider}-${t.id}`}
                className="flex items-center justify-between gap-4 border-l-2 border-blueprint-line bg-blueprint-raised/40 rounded px-4 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-[9px] font-mono uppercase tracking-wide rounded px-1.5 py-0.5 shrink-0"
                    style={{
                      color: t.provider === "stripe" ? "#635bff" : "#000000",
                      backgroundColor: t.provider === "stripe" ? "rgba(99,91,255,0.15)" : "rgba(255,255,255,0.85)",
                    }}
                  >
                    {t.provider === "stripe" ? "Stripe" : "GoCardless"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-blueprint-ink truncate">{t.description ?? "—"}</span>
                    <span className="block text-[11px] text-blueprint-muted truncate">{productOf(t)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-blueprint-muted">
                    {new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className="text-sm text-blueprint-ink font-medium w-16 text-right">
                    {formatPence(t.amountPence)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
