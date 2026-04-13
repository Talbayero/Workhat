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
    const { data: appUser } = await supabase
      .from("users")
      .select("org_id, organizations(id, slug, name)")
      .eq("auth_user_id", user.id)
      .single();

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

    const body = await req.json() as { plan?: string; billing?: string };
    const plan = body.plan as StripePlan;
    const billing = (body.billing ?? "monthly") as "monthly" | "annual";

    if (!plan || !["pro", "scale"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan. Must be 'pro' or 'scale'." }, { status: 400 });
    }

    const origin = req.nextUrl.origin;

    const session = await createCheckoutSession({
      plan,
      billing,
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
