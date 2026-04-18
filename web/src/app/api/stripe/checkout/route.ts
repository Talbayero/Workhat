import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, type StripePlan } from "@/lib/stripe";

/* ─────────────────────────────────────────────
   POST /api/stripe/checkout
   Creates a Stripe Checkout session and returns
   the redirect URL.

   Body: { plan: "pro" | "scale", billing: "monthly" | "annual" }
───────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    // Get org for this user
    const { data: appUser, error: appUserError } = await supabase
      .from("users")
      .select("org_id, organizations(id, slug, name)")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (appUserError) {
      return NextResponse.json({ error: appUserError.message }, { status: 500 });
    }

    if (!appUser) {
      return NextResponse.json({ error: "No org found — complete onboarding first" }, { status: 400 });
    }

    const raw = (appUser as unknown as {
      org_id: string;
      organizations: { id: string; slug: string; name: string } | { id: string; slug: string; name: string }[];
    });

    const org = Array.isArray(raw.organizations) ? raw.organizations[0] : raw.organizations;
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 400 });
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
      customerEmail: user.email ?? "",
      successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pricing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
