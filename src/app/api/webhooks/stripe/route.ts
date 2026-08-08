import { NextResponse } from "next/server";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // Past this point the event is verified as genuinely from Stripe.
  // Admin client is appropriate here — this is exactly the "reconciling
  // payment state" case documented in lib/supabase/admin.ts.
  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      // TODO: mark the relevant member_memberships row active, or
      // create it if this was a first-time signup via payment link.
      // const session = event.data.object as Stripe.Checkout.Session;
      break;
    }

    case "invoice.payment_failed": {
      // TODO: flag the membership, trigger a member notification.
      break;
    }

    case "customer.subscription.deleted": {
      // TODO: set member_memberships.status = 'cancelled'.
      break;
    }

    default:
      // Unhandled event types are fine to ignore — Stripe sends many
      // more event types than this app currently cares about.
      break;
  }

  // Reference so the unused-var lint doesn't fire before the TODOs above
  // are filled in with real Supabase writes.
  void supabase;

  return NextResponse.json({ received: true });
}
