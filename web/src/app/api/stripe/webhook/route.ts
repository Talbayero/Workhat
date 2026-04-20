import { NextRequest, NextResponse } from "next/server";
import { constructStripeEvent } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PLANS = new Set(["starter", "pro", "scale", "enterprise"]);

/** Validate that a Stripe metadata org_id is a real UUID before using it in queries. */
function isValidOrgId(id: string | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

/** Validate and sanitize a plan name from Stripe metadata. */
function sanitizePlan(plan: string | undefined, fallback = "pro"): string {
  const p = typeof plan === "string" ? plan.trim().toLowerCase() : fallback;
  return VALID_PLANS.has(p) ? p : fallback;
}

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

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Admin client unavailable";
    console.error("[stripe/webhook] admin client init failed:", message);
    return NextResponse.json({ error: "Webhook handler unavailable" }, { status: 503 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const meta = session.metadata as Record<string, string> | undefined;
        if (!isValidOrgId(meta?.org_id)) {
          console.warn("[stripe/webhook] checkout.session.completed: missing or invalid org_id in metadata");
          break;
        }

        const { error } = await supabase
          .from("organizations")
          .update({
            crm_plan: sanitizePlan(meta.plan),
            stripe_customer_id: (session.customer as string) ?? null,
            stripe_subscription_id: (session.subscription as string) ?? null,
            plan_status: "trialing",
          })
          .eq("id", meta.org_id);

        if (error) throw error;
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const meta = sub.metadata as Record<string, string> | undefined;
        if (!isValidOrgId(meta?.org_id)) {
          console.warn("[stripe/webhook] subscription.updated: missing or invalid org_id in metadata");
          break;
        }

        const status = sub.status as string;

        const { error } = await supabase
          .from("organizations")
          .update({ crm_plan: sanitizePlan(meta.plan), plan_status: status })
          .eq("id", meta.org_id);

        if (error) throw error;
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const meta = sub.metadata as Record<string, string> | undefined;
        if (!isValidOrgId(meta?.org_id)) {
          console.warn("[stripe/webhook] subscription.deleted: missing or invalid org_id in metadata");
          break;
        }

        const { error } = await supabase
          .from("organizations")
          .update({ crm_plan: "starter", plan_status: "canceled", stripe_subscription_id: null })
          .eq("id", meta.org_id);

        if (error) throw error;
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const orgId = ((invoice.subscription_details as Record<string, unknown> | undefined)
          ?.metadata) as Record<string, string> | undefined;
        if (!isValidOrgId(orgId?.org_id)) {
          console.warn("[stripe/webhook] invoice.payment_failed: missing or invalid org_id in metadata");
          break;
        }

        const { error } = await supabase
          .from("organizations")
          .update({ plan_status: "past_due" })
          .eq("id", orgId.org_id);

        if (error) throw error;
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
