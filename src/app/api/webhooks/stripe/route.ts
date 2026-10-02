import { NextResponse } from "next/server";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { handleCheckoutCompleted, handlePaymentFailed, handleSubscriptionDeleted } from "@/lib/stripe-checkout";

/**
 * Stripe webhook handler.
 *
 * SECURITY: signature verification happens BEFORE anything else runs.
 * An unverified webhook is an open door — anyone who finds this URL
 * could POST a fake "payment succeeded" event otherwise. Never move
 * the verification below the parsing, and never skip it "just for
 * local testing" without using the Stripe CLI's own signing instead.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const env = serverEnv();
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    // Fail loudly in an environment that isn't configured for Stripe yet,
    // rather than silently accepting unverifiable webhooks.
    return NextResponse.json(
      { error: "Stripe is not configured on this deployment" },
      { status: 500 }
    );
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Past this point the event is verified as genuinely from Stripe. The
  // handlers use the admin client — this is exactly the "reconciling
  // payment state" case documented in lib/supabase/admin.ts. A thrown
  // error returns 500 so Stripe retries the event; handlers are
  // idempotent (0040's unique stripe_checkout_session_id).
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutCompleted(stripe, event.data.object);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      default:
        // Unhandled event types are fine to ignore — Stripe sends many
        // more event types than this app currently cares about.
        break;
    }
  } catch (err) {
    console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
