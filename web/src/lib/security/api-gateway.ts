import { NextResponse, type NextRequest } from "next/server";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

type RoutePolicy = {
  id: string;
  methods?: string[];
  windowMs: number;
  maxRequests: number;
  blacklistAfter: number;
  captchaAfter?: number;
  maxBodyBytes?: number;
};

type RateBucket = {
  count: number;
  violations: number;
  resetAt: number;
};

type BlacklistEntry = {
  until: number;
  reason: string;
};

const minute = 60_000;
const dynamicBlacklistTtlMs = Number(process.env.SECURITY_DYNAMIC_BLACKLIST_TTL_MS ?? 15 * minute);

const buckets = new Map<string, RateBucket>();
const dynamicBlacklist = new Map<string, BlacklistEntry>();

const routePolicies: RoutePolicy[] = [
  { id: "public-waitlist", methods: ["POST"], windowMs: minute, maxRequests: 8, captchaAfter: 3, blacklistAfter: 3, maxBodyBytes: 8_192 },
  { id: "inbound-email-webhook", methods: ["POST"], windowMs: minute, maxRequests: 120, blacklistAfter: 4, maxBodyBytes: 2_000_000 },
  { id: "gmail-push-webhook", methods: ["POST"], windowMs: minute, maxRequests: 240, blacklistAfter: 4, maxBodyBytes: 64_000 },
  { id: "stripe-webhook", methods: ["POST"], windowMs: minute, maxRequests: 120, blacklistAfter: 4, maxBodyBytes: 256_000 },
  { id: "expensive-ai", methods: ["POST"], windowMs: minute, maxRequests: 30, blacklistAfter: 3, maxBodyBytes: 64_000 },
  { id: "email-connector", windowMs: minute, maxRequests: 60, blacklistAfter: 3, maxBodyBytes: 128_000 },
  { id: "api-default", windowMs: minute, maxRequests: 180, blacklistAfter: 4, maxBodyBytes: 512_000 },
];

function getStaticBlacklist() {
  return new Set(
    (process.env.SECURITY_IP_BLACKLIST ?? process.env.SECURITY_BLACKLISTED_IPS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

function getRoutePolicy(pathname: string): RoutePolicy {
  if (pathname === "/api/waitlist") return routePolicies[0];
  if (pathname.startsWith("/api/inbound/email")) return routePolicies[1];
  if (pathname.startsWith("/api/email/gmail/push")) return routePolicies[2];
  if (pathname.startsWith("/api/stripe/webhook")) return routePolicies[3];
  if (pathname.startsWith("/api/ai/")) return routePolicies[4];
  if (pathname.startsWith("/api/email/")) return routePolicies[5];
  return routePolicies[6];
}

function gatewayJson(body: Record<string, unknown>, status: number) {
  const response = NextResponse.json(body, { status });
  return applyApiGatewayHeaders(response);
}

export function applyApiGatewayHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-Work-Hat-Gateway", "active");
  return response;
}

function cleanupBlacklist(now: number) {
  for (const [ip, entry] of dynamicBlacklist.entries()) {
    if (entry.until <= now) dynamicBlacklist.delete(ip);
  }
}

function getBucket(key: string, now: number, policy: RoutePolicy) {
  const existing = buckets.get(key);
  if (existing && existing.resetAt > now) return existing;

  const next = {
    count: 0,
    violations: existing?.violations ?? 0,
    resetAt: now + policy.windowMs,
  };
  buckets.set(key, next);
  return next;
}

function isCaptchaConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY);
}

function readCaptchaToken(request: NextRequest) {
  return (
    request.headers.get("x-turnstile-token") ||
    request.headers.get("x-captcha-token") ||
    request.headers.get("cf-turnstile-response")
  );
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "captcha_not_configured" };

  const response = await fetchWithCircuitBreaker("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  }, { key: "turnstile-siteverify", timeoutMs: 8_000 });

  const result = await response.json().catch(() => ({})) as { success?: boolean; "error-codes"?: string[] };
  return {
    ok: Boolean(result.success),
    reason: result["error-codes"]?.join(",") || "captcha_failed",
  };
}

export async function guardApiRequest(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return null;

  const now = Date.now();
  cleanupBlacklist(now);

  const ip = getClientIp(request);
  const policy = getRoutePolicy(pathname);
  const staticBlacklist = getStaticBlacklist();

  if (staticBlacklist.has(ip)) {
    return gatewayJson({ error: "Request blocked", code: "static_blacklist" }, 403);
  }

  const dynamicEntry = dynamicBlacklist.get(ip);
  if (dynamicEntry && dynamicEntry.until > now) {
    return gatewayJson({
      error: "Request temporarily blocked",
      code: "dynamic_blacklist",
      reason: dynamicEntry.reason,
      retryAfterSeconds: Math.ceil((dynamicEntry.until - now) / 1000),
    }, 403);
  }

  if (request.headers.has("x-middleware-subrequest")) {
    dynamicBlacklist.set(ip, { until: now + dynamicBlacklistTtlMs, reason: "middleware_subrequest_header" });
    return gatewayJson({ error: "Request blocked", code: "suspicious_header" }, 403);
  }

  if (policy.methods && !policy.methods.includes(request.method)) {
    return gatewayJson({ error: "Method not allowed", code: "method_not_allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (policy.maxBodyBytes && contentLength > policy.maxBodyBytes) {
    return gatewayJson({ error: "Request body too large", code: "body_too_large" }, 413);
  }

  const bucket = getBucket(`${policy.id}:${ip}`, now, policy);
  bucket.count += 1;

  if (isCaptchaConfigured() && policy.captchaAfter && bucket.count > policy.captchaAfter) {
    const token = readCaptchaToken(request);
    if (!token) {
      return gatewayJson({
        error: "Additional verification required",
        code: "captcha_required",
        provider: "turnstile",
      }, 403);
    }

    const captcha = await verifyTurnstile(token, ip);
    if (!captcha.ok) {
      return gatewayJson({ error: "CAPTCHA verification failed", code: "captcha_failed", reason: captcha.reason }, 403);
    }

    bucket.count = 1;
    bucket.violations = 0;
  }

  if (bucket.count > policy.maxRequests) {
    bucket.violations += 1;

    if (bucket.violations >= policy.blacklistAfter && ip !== "unknown") {
      dynamicBlacklist.set(ip, { until: now + dynamicBlacklistTtlMs, reason: `rate_limit:${policy.id}` });
    }

    return gatewayJson({
      error: "Too many requests",
      code: "rate_limited",
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    }, 429);
  }

  return null;
}
