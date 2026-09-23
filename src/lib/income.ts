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
  /** What was bought — provider product/subscription name, or null if unknown. */
  product: string | null;
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
    const productNames = new Map<string, string>();
    for await (const product of stripe.products.list({ limit: 100 })) {
      productNames.set(product.id, product.name);
    }

    const charges = stripe.charges.list({
      created: { gte: Math.floor(startDate.getTime() / 1000), lt: Math.floor(endDate.getTime() / 1000) },
      limit: 100,
      expand: ["data.invoice"],
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
        product: await stripeChargeProduct(stripe, charge, productNames),
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

function productIdOf(product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined) {
  if (!product) return null;
  return typeof product === "string" ? product : product.id;
}

/**
 * Subscription payments carry an invoice whose line items name the price's
 * product; one-off payment-link purchases carry a Checkout Session instead.
 * Falls back to the charge description, then null.
 */
async function stripeChargeProduct(
  stripe: Stripe,
  charge: Stripe.Charge,
  productNames: Map<string, string>
): Promise<string | null> {
  const nameFromIds = (ids: (string | null)[]) => {
    const names = [...new Set(ids.flatMap((id) => (id && productNames.get(id) ? [productNames.get(id)!] : [])))];
    return names.length > 0 ? names.join(" + ") : null;
  };

  const invoice = charge.invoice;
  if (invoice && typeof invoice !== "string") {
    const name = nameFromIds(invoice.lines.data.map((line) => productIdOf(line.price?.product)));
    if (name) return name;
  }

  const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (paymentIntent) {
    const sessions = await stripe.checkout.sessions.list({
      payment_intent: paymentIntent,
      limit: 1,
      expand: ["data.line_items"],
    });
    const lineItems = sessions.data[0]?.line_items?.data ?? [];
    const name = nameFromIds(lineItems.map((item) => productIdOf(item.price?.product)));
    if (name) return name;
    const described = lineItems.map((item) => item.description).filter(Boolean).join(" + ");
    if (described) return described;
  }

  return charge.description ?? null;
}

type GoCardlessPayment = {
  id: string;
  amount: number;
  status: string;
  description: string | null;
  charge_date?: string;
  created_at: string;
  links?: { subscription?: string };
};

export async function fetchGoCardlessIncome(startDate: Date, endDate: Date): Promise<IncomeResult> {
  const env = serverEnv();
  if (!env.GOCARDLESS_ACCESS_TOKEN) {
    return { transactions: [], totalPence: 0, configured: false };
  }

  const baseUrl =
    env.GOCARDLESS_ENVIRONMENT === "live" ? "https://api.gocardless.com" : "https://api-sandbox.gocardless.com";
  const transactions: IncomeTransaction[] = [];
  const subscriptionNames = new Map<string, string | null>();
  let after: string | undefined;
  const headers = {
    Authorization: `Bearer ${env.GOCARDLESS_ACCESS_TOKEN}`,
    "GoCardless-Version": "2015-07-06",
    Accept: "application/json",
  };

  // A payment's product is the name of the subscription it was collected
  // under (e.g. "Unlimited"); one-off payments just have a description.
  async function subscriptionName(id: string) {
    if (!subscriptionNames.has(id)) {
      const res = await fetch(`${baseUrl}/subscriptions/${id}`, { headers });
      const body: { subscriptions?: { name?: string | null } } | null = res.ok ? await res.json() : null;
      subscriptionNames.set(id, body?.subscriptions?.name ?? null);
    }
    return subscriptionNames.get(id) ?? null;
  }

  try {
    do {
      const params = new URLSearchParams({
        "created_at[gte]": startDate.toISOString(),
        "created_at[lt]": endDate.toISOString(),
        limit: "100",
      });
      if (after) params.set("after", after);

      const res = await fetch(`${baseUrl}/payments?${params}`, { headers });

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
          product: payment.links?.subscription
            ? ((await subscriptionName(payment.links.subscription)) ?? payment.description)
            : payment.description,
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
