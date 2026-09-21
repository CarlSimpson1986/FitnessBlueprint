import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

export type IncomeTransaction = {
  id: string;
  provider: "stripe" | "gocardless";
  amountPence: number;
  description: string | null;
  date: string; // ISO
  status: string;
};

export type IncomeResult = {
  transactions: IncomeTransaction[];
  totalPence: number;
  configured: boolean;
  error?: string;
};

/**
 * Read-only — no purchasing/checkout flow here. Guy's payment links and
 * mandates already exist outside the app; this just reports on what came
 * in, pulling directly from each provider's API rather than a local
 * payments table (there isn't one — the Stripe webhook handler,
 * src/app/api/webhooks/stripe/route.ts, still has its event handlers as
 * TODOs, deliberately deferred pending the member-mapping decision. That
 * decision doesn't block a read-only totals view, which is all that was
 * asked for here.)
 */
export async function fetchStripeIncome(startDate: Date, endDate: Date): Promise<IncomeResult> {
  const env = serverEnv();
  if (!env.STRIPE_SECRET_KEY) {
    return { transactions: [], totalPence: 0, configured: false };
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const transactions: IncomeTransaction[] = [];

  try {
    const charges = stripe.charges.list({
      created: { gte: Math.floor(startDate.getTime() / 1000), lt: Math.floor(endDate.getTime() / 1000) },
      limit: 100,
    });

    for await (const charge of charges) {
      if (charge.status !== "succeeded" || charge.refunded) continue;
      transactions.push({
        id: charge.id,
        provider: "stripe",
        amountPence: charge.amount,
        description: charge.billing_details?.name ?? charge.description ?? null,
        date: new Date(charge.created * 1000).toISOString(),
        status: charge.status,
      });
    }
  } catch (err) {
    return {
      transactions: [],
      totalPence: 0,
      configured: true,
      error: err instanceof Error ? err.message : "Stripe request failed",
    };
  }

  return {
    transactions,
    totalPence: transactions.reduce((sum, t) => sum + t.amountPence, 0),
    configured: true,
  };
}

type GoCardlessPayment = {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  charge_date?: string;
  created_at: string;
};

export async function fetchGoCardlessIncome(startDate: Date, endDate: Date): Promise<IncomeResult> {
  const env = serverEnv();
  if (!env.GOCARDLESS_ACCESS_TOKEN) {
    return { transactions: [], totalPence: 0, configured: false };
  }

  const baseUrl =
    env.GOCARDLESS_ENVIRONMENT === "live" ? "https://api.gocardless.com" : "https://api-sandbox.gocardless.com";
  const transactions: IncomeTransaction[] = [];
  let after: string | undefined;

  try {
    do {
      const params = new URLSearchParams({
        "created_at[gte]": startDate.toISOString(),
        "created_at[lt]": endDate.toISOString(),
        limit: "100",
      });
      if (after) params.set("after", after);

      const res = await fetch(`${baseUrl}/payments?${params}`, {
        headers: {
          Authorization: `Bearer ${env.GOCARDLESS_ACCESS_TOKEN}`,
          "GoCardless-Version": "2015-07-06",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          transactions: [],
          totalPence: 0,
          configured: true,
          error: `GoCardless request failed (${res.status}): ${body}`,
        };
      }

      const data: { payments: GoCardlessPayment[]; meta?: { cursors?: { after?: string | null } } } =
        await res.json();

      for (const payment of data.payments ?? []) {
        if (payment.status !== "confirmed" && payment.status !== "paid_out") continue;
        transactions.push({
          id: payment.id,
          provider: "gocardless",
          amountPence: payment.amount,
          description: payment.description,
          date: payment.charge_date ?? payment.created_at,
          status: payment.status,
        });
      }

      after = data.meta?.cursors?.after ?? undefined;
    } while (after);
  } catch (err) {
    return {
      transactions: [],
      totalPence: 0,
      configured: true,
      error: err instanceof Error ? err.message : "GoCardless request failed",
    };
  }

  return {
    transactions,
    totalPence: transactions.reduce((sum, t) => sum + t.amountPence, 0),
    configured: true,
  };
}
