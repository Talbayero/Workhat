import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

/* ─────────────────────────────────────────────
   Stripe helper — raw fetch, no SDK
   Set STRIPE_SECRET_KEY in .env.local
───────────────────────────────────────────── */

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY env var is not set");
  return key;
}

function authHeader() {
  return "Basic " + Buffer.from(stripeKey() + ":").toString("base64");
}

/** Convert a plain object to application/x-www-form-urlencoded, supporting nested keys. */
function encode(data: Record<string, unknown>, prefix = ""): string {
  return Object.entries(data)
    .flatMap(([k, v]) => {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v === null || v === undefined) return [];
      if (typeof v === "object" && !Array.isArray(v)) {
        return encode(v as Record<string, unknown>, key).split("&").filter(Boolean);
      }
      if (Array.isArray(v)) {
        return v.map((item, i) =>
          typeof item === "object"
            ? encode(item as Record<string, unknown>, `${key}[${i}]`)
            : `${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`
        );
      }
      return [`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`];
    })
    .join("&");
}

export type StripePlan = "pro" | "scale";

export const STRIPE_PRICES: Record<StripePlan, { monthly: string; annual: string }> = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "price_pro_monthly_placeholder",
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? "price_pro_annual_placeholder",
  },
  scale: {
    monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY ?? "price_scale_monthly_placeholder",
    annual: process.env.STRIPE_PRICE_SCALE_ANNUAL ?? "price_scale_annual_placeholder",
  },
};

export interface CreateCheckoutOptions {
  plan: StripePlan;
  billing: "monthly" | "annual";
  orgId: string;
  orgSlug: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export async function createCheckoutSession(opts: CreateCheckoutOptions) {
  const priceId = STRIPE_PRICES[opts.plan][opts.billing];

  const body = encode({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    customer_email: opts.customerEmail,
    "metadata[org_id]": opts.orgId,
    "metadata[org_slug]": opts.orgSlug,
    "metadata[plan]": opts.plan,
    "metadata[billing]": opts.billing,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: "true",
    "subscription_data[trial_period_days]": "14",
    "subscription_data[metadata][org_id]": opts.orgId,
  });

  const res = await fetchWithCircuitBreaker(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }, { key: "stripe-checkout-session", timeoutMs: 20_000 });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message ?? "Stripe error");
  }

  return res.json() as Promise<{ id: string; url: string }>;
}

export async function constructStripeEvent(
  rawBody: string,
  signature: string,
  secret: string
): Promise<{ type: string; data: { object: Record<string, unknown> } }> {
  // Verify Stripe signature using HMAC-SHA256.
  const encoder = new TextEncoder();
  const [, timestampPart, v1Part] =
    signature.match(/t=(\d+).*?v1=([a-f0-9]+)/) ?? [];

  if (!timestampPart || !v1Part) {
    throw new Error("Invalid Stripe signature header");
  }

  const signedPayload = `${timestampPart}.${rawBody}`;
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(signedPayload);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, msgData);
  const expectedSig = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expectedSig !== v1Part) {
    throw new Error("Stripe signature verification failed");
  }

  // Tolerate up to 5 minute clock skew.
  const ts = parseInt(timestampPart, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) {
    throw new Error("Stripe webhook timestamp too old");
  }

  return JSON.parse(rawBody);
}
