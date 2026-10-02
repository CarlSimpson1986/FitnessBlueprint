import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { activateMembership, createAccountWithWelcome, escapeHtml } from "@/lib/accounts";
import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";

/**
 * Stripe payment -> app access (decided 2026-10-01, see ROADMAP).
 *
 * Guy sells through Stripe payment links. When one is paid, the bought
 * product's NAME is matched to membership_plans.stripe_product_name
 * (migration 0040), then the buyer's account is created (or found by
 * email) and the plan activated. Payment always happens first; the app
 * only grants access.
 *
 * Anything a retry can't fix (unknown product, no email, a staff email)
 * is emailed to the owner and acknowledged, so Stripe stops retrying.
 * Database failures throw, so the webhook returns 500 and Stripe retries.
 *
 * Only called from the signature-verified webhook route, which is why the
 * admin client is fine here (lib/supabase/admin.ts lists this use).
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
  // Bank-debit style payments complete the checkout before the money
  // arrives; those come back as checkout.session.async_payment_succeeded.
  if (session.payment_status === "unpaid") return;

  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("member_memberships")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return; // already handled — Stripe redelivered the event

  const email = session.customer_details?.email?.trim().toLowerCase();
  const customerName = session.customer_details?.name?.trim() || "";
  const ref = `Stripe checkout ${session.id}`;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ["data.price.product"],
    limit: 20,
  });
  const products = lineItems.data
    .map((item) => {
      const product = item.price?.product;
      return product && typeof product === "object" && !("deleted" in product && product.deleted)
        ? { name: (product as Stripe.Product).name, unitAmount: item.price?.unit_amount ?? null }
        : null;
    })
    .filter((p): p is { name: string; unitAmount: number | null } => p !== null);

  const { data: plans, error: plansError } = await admin
    .from("membership_plans")
    .select("id, name, price_pence, stripe_product_name")
    .not("stripe_product_name", "is", null);
  if (plansError) throw new Error(plansError.message);

  const normalise = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const matches = products.flatMap((product) => {
    const plan = plans.find((p) => normalise(p.stripe_product_name!) === normalise(product.name));
    return plan ? [{ plan, product }] : [];
  });

  const who = `${escapeHtml(customerName || "(no name)")} &lt;${escapeHtml(email ?? "no email")}&gt;`;
  const bought = products.map((p) => escapeHtml(p.name)).join(", ") || "(no products found)";

  const match = matches.length === 1 ? matches[0] : null;
  if (!match) {
    await notifyOwners(
      "Stripe payment needs setting up by hand",
      `${who} paid for <strong>${bought}</strong>, but ${
        matches.length === 0
          ? "none of those products matches a plan in the app"
          : "more than one of those products matches a plan, so the app didn't guess which"
      }. Create or find their account on the Members page and assign the plan yourself.<br><br>${ref}`
    );
    return;
  }

  if (!email) {
    await notifyOwners(
      "Stripe payment has no email address",
      `Someone paid for <strong>${bought}</strong> but Stripe didn't record an email, so no account was created. Check the payment in Stripe.<br><br>${ref}`
    );
    return;
  }

  const { plan, product } = match;

  // Plans added in 0040 start at 0p — Stripe holds the real price.
  if (plan.price_pence === 0 && product.unitAmount) {
    await admin.from("membership_plans").update({ price_pence: product.unitAmount }).eq("id", plan.id);
  }

  const member = await findOrCreateMember(admin, email, customerName, plan.name, who, bought, ref);
  if (!member) return;

  const { error } = await activateMembership(admin, {
    memberId: member.id,
    planId: plan.id,
    createdBy: null,
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
  });
  if (error) throw new Error(`activateMembership failed for ${ref}: ${error}`);

  // New accounts got the welcome email with their sign-in details already.
  if (member.existingName !== null) {
    await sendEmail({
      to: email,
      subject: `Your ${plan.name} plan is active`,
      html: planActiveEmailHtml(member.existingName, plan.name),
    });
  }
}

/**
 * Returns the member (existingName set if they already had an account),
 * or null if the owner has been asked to sort it out.
 */
async function findOrCreateMember(
  admin: AdminClient,
  email: string,
  customerName: string,
  planName: string,
  who: string,
  bought: string,
  ref: string
): Promise<{ id: string; existingName: string | null } | null> {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (profile) {
    if (profile.role !== "member") {
      await notifyOwners(
        "Stripe payment from a staff email",
        `${who} paid for <strong>${bought}</strong>, but that email belongs to a ${profile.role} account, so the app didn't change it. Assign the plan by hand if it's right.<br><br>${ref}`
      );
      return null;
    }
    return { id: profile.id, existingName: profile.full_name };
  }

  const fullName = customerName || email.split("@")[0] || email;
  const created = await createAccountWithWelcome(
    fullName,
    email,
    "member",
    `Thanks for joining — your ${planName} plan is active.`
  );
  if (created.error || !created.userId) {
    throw new Error(`Account creation failed for ${ref}: ${created.error}`);
  }
  return { id: created.userId, existingName: null };
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("member_memberships")
    .update({ status: "cancelled" })
    .eq("stripe_subscription_id", subscription.id)
    .eq("status", "active");
  if (error) throw new Error(error.message);
}

/**
 * Stripe retries a failed monthly payment for a while before cancelling
 * the subscription (which then lands in handleSubscriptionDeleted), so
 * access isn't cut here — the owner is just told so he can follow up.
 */
export async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;

  const admin = createAdminClient();
  const { data: membership, error } = await admin
    .from("member_memberships")
    .select("member_id")
    .eq("stripe_subscription_id", subscriptionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const { data: profile } = membership
    ? await admin.from("profiles").select("full_name, email").eq("id", membership.member_id).maybeSingle()
    : { data: null };
  const name = profile?.full_name ?? invoice.customer_name ?? "A member";
  const email = profile?.email ?? invoice.customer_email ?? "";
  await notifyOwners(
    `Payment failed: ${name}`,
    `A monthly payment from <strong>${escapeHtml(name)}</strong> ${escapeHtml(email)} failed. Stripe will retry it automatically; if it keeps failing the subscription is cancelled and their access stops.<br><br>Stripe invoice ${escapeHtml(invoice.id ?? "")}`
  );
}

async function notifyOwners(subject: string, bodyHtml: string) {
  const admin = createAdminClient();
  const { data: owners } = await admin.from("profiles").select("email").eq("role", "owner");
  const membersUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/admin/members`;
  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <p style="font-size:16px;line-height:1.5">${bodyHtml}</p>
  <p style="margin:28px 0"><a href="${membersUrl}" style="color:#2e9bf0">Open Members</a></p>
</div>`.trim();
  for (const owner of owners ?? []) {
    const { error } = await sendEmail({ to: owner.email, subject, html });
    if (error) console.error(`notifyOwners: "${subject}" to ${owner.email} failed —`, error);
  }
  console.warn(`Stripe webhook owner notice: ${subject}`);
}

function planActiveEmailHtml(fullName: string, planName: string) {
  const firstName = escapeHtml(fullName.split(" ")[0] ?? fullName);
  const loginUrl = `${publicEnv.NEXT_PUBLIC_SITE_URL}/login`;
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;color:#111">
  <p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2e9bf0;font-weight:700;margin:0 0 20px">Fitness Blueprint</p>
  <h1 style="font-size:22px;margin:0 0 16px">Thanks, ${firstName}</h1>
  <p style="font-size:16px;line-height:1.5">Your <strong>${escapeHtml(planName)}</strong> plan is active. Sign in to book your sessions.</p>
  <p style="margin:28px 0">
    <a href="${loginUrl}" style="background:#2e9bf0;color:#000;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;display:inline-block">Sign in</a>
  </p>
  <p style="font-size:13px;color:#666;margin-top:28px">Fitness Blueprint</p>
</div>`.trim();
}
