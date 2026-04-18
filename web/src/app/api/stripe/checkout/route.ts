import { NextRequest, NextResponse } from "next/server";
import { createCheckoutSession, type StripePlan } from "@/lib/stripe";
import { getCurrentAppUser, type CurrentAppUser } from "@/lib/auth/app-user";

/* ─────────────────────────────────────────────
   POST /api/stripe/checkout
   Creates a Stripe Checkout session and returns
   the redirect URL.

   Body: { plan: "pro" | "scale", billing: "monthly" | "annual" }
───────────────────────────────────────────── */

type CheckoutAppUser = CurrentAppUser & {
  email: string;
  organizations: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[] | null;
};

export async function POST(req: NextRequest) {
  try {
    const appUser = await getCurrentAppUser<CheckoutAppUser>({
      label: "stripe/checkout",
      select: "id, org_id, role, email, organizations(id, slug, name)",
    });

    if (!appUser) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const raw = appUser.organizations;
    const org = Array.isArray(raw) ? raw[0] : raw;
    if (!org) {
      return NextResponse.json({ error: "No org found — complete onboarding first" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const plan = body.plan;
    const billing = body.billing ?? "monthly";

    if (typeof plan !== "string" || !["pro", "scale"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan. Must be 'pro' or 'scale'." }, { status: 400 });
    }
    if (typeof billing !== "string" || !["monthly", "annual"].includes(billing)) {
      return NextResponse.json({ error: "Invalid billing period. Must be 'monthly' or 'annual'." }, { status: 400 });
    }

    const origin = req.nextUrl.origin;

    const session = await createCheckoutSession({
      plan: plan as StripePlan,
      billing: billing as "monthly" | "annual",
      orgId: org.id,
      orgSlug: org.slug,
      customerEmail: appUser.email ?? "",
      successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
