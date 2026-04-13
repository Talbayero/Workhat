import { NextRequest, NextResponse } from "next/server";
import { constructStripeEvent } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/* ─────────────────────────────────────────────
   POST /api/stripe/webhook
   Handles Stripe lifecycle events:
   - checkout.session.completed  → activate trial
   - customer.subscription.updated → update plan
   - customer.subscription.deleted → downgrade to starter
───────────────────────────────────────────── */

export const runtime = "nodejs";

// Stripe sends raw body — must not be parsed as JSON
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = await constructStripeEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata as Record<string, string> | undefined;
        if (!meta?.org_id) break;

        await supabase
          .from("organizations")
          .update({
            crm_plan: (meta.plan ?? "pro") as string,
            stripe_customer_id: (session.customer as string) ?? null,
            stripe_subscription_id: (session.subscription as string) ?? null,
            plan_status: "trialing",
          })
          .eq("id", meta.org_id);

        console.log(`[stripe/webhook] Activated ${meta.plan} trial for org ${meta.org_id}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const meta = sub.metadata as Record<string, string> | undefined;
        if (!meta?.org_id) break;

        const status = sub.status as string;
        const crm_plan = meta.plan ?? "pro";

        await supabase
          .from("organizations")
          .update({ crm_plan, plan_status: status })
          .eq("id", meta.org_id);

        console.log(`[stripe/webhook] Updated org ${meta.org_id} → ${crm_plan} (${status})`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const meta = sub.metadata as Record<string, string> | undefined;
        if (!meta?.org_id) break;

        await supabase
          .from("organizations")
          .update({ crm_plan: "starter", plan_status: "canceled", stripe_subscription_id: null })
          .eq("id", meta.org_id);

        console.log(`[stripe/webhook] Downgraded org ${meta.org_id} to starter`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const orgId = (invoice.subscription_details as Record<string, unknown> | undefined)
          ?.metadata as Record<string, string> | undefined;
        if (!orgId?.org_id) break;

        await supabase
          .from("organizations")
          .update({ plan_status: "past_due" })
          .eq("id", orgId.org_id);

        break;
      }

      default:
        // Unhandled — still return 200 so Stripe doesn't retry
        break;
    }
  } catch (err) {
    console.error("[stripe/webhook] Handler error:", err);
    // Return 200 so Stripe doesn't retry — log the error internally
  }

  return NextResponse.json({ received: true });
}
