import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { fetchWithCircuitBreaker } from "@/lib/security/circuit-breaker";

type RateLimitKeyMode = "ip" | "user-or-ip" | "org-user-or-ip";

type RoutePolicy = {
  id: string;
  methods?: string[];
  windowMs: number;
  maxRequests: number;
  blacklistAfter: number;
  captchaAfter?: number;
  maxBodyBytes?: number;
  keyMode: RateLimitKeyMode;
  trustedSystem?: boolean;
  dynamicBlacklist?: boolean;
  failOpenOnStoreUnavailable?: boolean;
};

type GatewayContext = {
  phase?: "pre-auth" | "post-auth";
  userId?: string | null;
  orgId?: string | null;
};

type RateLimitResult = {
  allowed: boolean;
  count: number;
  resetAt: number;
  remaining: number;
  retryAfterSeconds: number;
  limitedBy: string;
};

type RedisState = {
  client: Redis | null;
  reason?: string;
};

const minute = 60_000;
const dynamicBlacklistTtlMs = Number(process.env.SECURITY_DYNAMIC_BLACKLIST_TTL_MS ?? 15 * minute);
const keyPrefix = process.env.SECURITY_RATE_LIMIT_KEY_PREFIX || "workhat:rate:v1";
const productionRuntime = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";

const POLICIES: Record<string, RoutePolicy> = {
  "public-waitlist":       { id: "public-waitlist",       methods: ["POST"], windowMs: minute, maxRequests: 8,   captchaAfter: 3, blacklistAfter: 3, keyMode: "ip", maxBodyBytes: 8_192 },
  "inbound-email-webhook": { id: "inbound-email-webhook", methods: ["POST"], windowMs: minute, maxRequests: 120, blacklistAfter: 0, keyMode: "ip", trustedSystem: true, dynamicBlacklist: false, maxBodyBytes: 2_000_000 },
  "gmail-push-webhook":    { id: "gmail-push-webhook",    methods: ["POST"], windowMs: minute, maxRequests: 240, blacklistAfter: 0, keyMode: "ip", trustedSystem: true, dynamicBlacklist: false, maxBodyBytes: 64_000 },
  "stripe-webhook":        { id: "stripe-webhook",        methods: ["POST"], windowMs: minute, maxRequests: 120, blacklistAfter: 0, keyMode: "ip", trustedSystem: true, dynamicBlacklist: false, maxBodyBytes: 256_000 },
  "onboarding-create-org":  { id: "onboarding-create-org", methods: ["POST"], windowMs: minute, maxRequests: 8,   blacklistAfter: 0, keyMode: "user-or-ip", dynamicBlacklist: false, failOpenOnStoreUnavailable: true, maxBodyBytes: 16_384 },
  "email-setup":            { id: "email-setup",            windowMs: minute, maxRequests: 30,  blacklistAfter: 0, keyMode: "user-or-ip", dynamicBlacklist: false, failOpenOnStoreUnavailable: true, maxBodyBytes: 128_000 },
  // Authenticated app APIs fail open if Redis is unavailable so the product
  // remains usable during setup. Admin diagnostics still surface Redis as a
  // production hardening gap; public unauthenticated routes remain stricter.
  // All LLM-backed routes (30 req/min). knowledge/gaps gets its own tighter cap below.
  "expensive-ai":          { id: "expensive-ai",          windowMs: minute, maxRequests: 30,  blacklistAfter: 3, keyMode: "org-user-or-ip", failOpenOnStoreUnavailable: true, maxBodyBytes: 64_000 },
  "email-connector":       { id: "email-connector",       windowMs: minute, maxRequests: 60,  blacklistAfter: 3, keyMode: "user-or-ip", failOpenOnStoreUnavailable: true, maxBodyBytes: 128_000 },
  "api-default":           { id: "api-default",           windowMs: minute, maxRequests: 180, blacklistAfter: 4, keyMode: "user-or-ip", failOpenOnStoreUnavailable: true, maxBodyBytes: 512_000 },
  // knowledge/gaps fires up to 5 parallel LLM calls per request — intentionally tight.
  "knowledge-gaps":        { id: "knowledge-gaps",        methods: ["GET"], windowMs: minute, maxRequests: 6, blacklistAfter: 2, keyMode: "org-user-or-ip", failOpenOnStoreUnavailable: true, maxBodyBytes: 0 },
};

let redisState: RedisState | null = null;

function getRedisState(): RedisState {
  if (redisState) return redisState;

  const hasUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!hasUrl || !hasToken) {
    redisState = {
      client: null,
      reason: "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required",
    };
    return redisState;
  }

  try {
    redisState = { client: Redis.fromEnv() };
  } catch (error) {
    redisState = {
      client: null,
      reason: error instanceof Error ? error.message : "Unable to initialize Upstash Redis",
    };
  }

  return redisState;
}

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

function envKeyForPolicy(policyId: string, suffix: string) {
  return `SECURITY_RATE_LIMIT_${policyId.replace(/-/g, "_").toUpperCase()}_${suffix}`;
}

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function withEnvOverrides(policy: RoutePolicy): RoutePolicy {
  return {
    ...policy,
    windowMs: numberFromEnv(envKeyForPolicy(policy.id, "WINDOW_MS"), policy.windowMs),
    maxRequests: numberFromEnv(envKeyForPolicy(policy.id, "MAX_REQUESTS"), policy.maxRequests),
    blacklistAfter: numberFromEnv(envKeyForPolicy(policy.id, "BLACKLIST_AFTER"), policy.blacklistAfter),
  };
}

function getRoutePolicy(pathname: string): RoutePolicy {
  if (pathname === "/api/waitlist")                      return withEnvOverrides(POLICIES["public-waitlist"]);
  if (pathname.startsWith("/api/inbound/email"))         return withEnvOverrides(POLICIES["inbound-email-webhook"]);
  if (pathname.startsWith("/api/email/gmail/push"))      return withEnvOverrides(POLICIES["gmail-push-webhook"]);
  if (pathname.startsWith("/api/stripe/webhook"))        return withEnvOverrides(POLICIES["stripe-webhook"]);
  if (pathname === "/api/org/create")                    return withEnvOverrides(POLICIES["onboarding-create-org"]);
  if (pathname === "/api/email/connections")             return withEnvOverrides(POLICIES["email-setup"]);
  if (pathname === "/api/email/custom-inbound")           return withEnvOverrides(POLICIES["email-setup"]);
  if (pathname === "/api/email/gmail/connect")            return withEnvOverrides(POLICIES["email-setup"]);
  if (pathname === "/api/oauth/google/start")             return withEnvOverrides(POLICIES["email-setup"]);
  if (pathname === "/api/oauth/google/callback")          return withEnvOverrides(POLICIES["email-setup"]);
  if (pathname.startsWith("/api/ai/"))                   return withEnvOverrides(POLICIES["expensive-ai"]);
  if (pathname.startsWith("/api/email/"))                return withEnvOverrides(POLICIES["email-connector"]);
  // LLM-backed knowledge and intent routes — must be ordered before api-default.
  // knowledge/gaps fires up to 5 parallel LLM calls per request — tightest cap.
  if (pathname.startsWith("/api/knowledge/gaps"))        return withEnvOverrides(POLICIES["knowledge-gaps"]);
  if (pathname.startsWith("/api/knowledge/from-edit"))   return withEnvOverrides(POLICIES["expensive-ai"]);
  if (pathname.startsWith("/api/knowledge/rewrite"))     return withEnvOverrides(POLICIES["expensive-ai"]);
  if (pathname.startsWith("/api/intent-corrections"))    return withEnvOverrides(POLICIES["expensive-ai"]);
  return withEnvOverrides(POLICIES["api-default"]);
}

function gatewayJson(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  const response = NextResponse.json(body, { status });
  if (headers) {
    for (const [key, value] of new Headers(headers).entries()) {
      response.headers.set(key, value);
    }
  }
  return applyApiGatewayHeaders(response);
}

export function applyApiGatewayHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Ensure HSTS is present even on gateway-rejected responses (rate-limited,
  // blacklisted, etc.) that bypass the next.config.ts header layer.
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.headers.set("X-Work-Hat-Gateway", "active");
  return response;
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

async function hashKeyPart(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

async function redisKey(kind: string, id: string, value: string) {
  return `${keyPrefix}:${kind}:${id}:${await hashKeyPart(value)}`;
}

function shouldFailOpen(policy: RoutePolicy) {
  if (process.env.SECURITY_RATE_LIMIT_FAIL_OPEN === "true") return true;
  if (process.env.SECURITY_RATE_LIMIT_FAIL_OPEN === "false") return false;
  return !productionRuntime || Boolean(policy.trustedSystem) || Boolean(policy.failOpenOnStoreUnavailable);
}

function rateLimitStoreUnavailable(policy: RoutePolicy, logDetail: string, clientDetail = "Rate limiting is temporarily unavailable.") {
  console.warn("[api-gateway] Rate limit store unavailable:", logDetail);
  if (shouldFailOpen(policy)) return null;
  return gatewayJson({
    error: "Request protection temporarily unavailable",
    code: "rate_limit_store_unavailable",
    detail: clientDetail,
  }, 503, { "Retry-After": "30" });
}

function shouldRateLimitInPhase(policy: RoutePolicy, phase: GatewayContext["phase"]) {
  if (phase === "pre-auth") return policy.keyMode === "ip" || Boolean(policy.trustedSystem);
  return policy.keyMode !== "ip" && !policy.trustedSystem;
}

function getIdentity(policy: RoutePolicy, context: GatewayContext, ip: string) {
  if (policy.keyMode === "org-user-or-ip" && context.orgId) return { value: `org:${context.orgId}`, label: "org" };
  if (policy.keyMode !== "ip" && context.userId) return { value: `user:${context.userId}`, label: "user" };
  return { value: `ip:${ip}`, label: "ip" };
}

function rateLimitHeaders(policy: RoutePolicy, result: RateLimitResult) {
  const resetSeconds = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));
  return {
    "RateLimit-Limit": String(policy.maxRequests),
    "RateLimit-Remaining": String(Math.max(0, result.remaining)),
    "RateLimit-Reset": String(resetSeconds),
    "X-RateLimit-Policy": policy.id,
    "X-RateLimit-Identity": result.limitedBy,
  };
}

async function checkDynamicBlacklist(redis: Redis, ip: string) {
  if (ip === "unknown") return null;
  const key = await redisKey("blacklist", "ip", ip);
  const [reason, ttl] = await Promise.all([
    redis.get<string>(key),
    redis.ttl(key),
  ]);
  if (!reason || ttl <= 0) return null;
  return {
    reason,
    retryAfterSeconds: ttl,
  };
}

async function addDynamicBlacklist(redis: Redis, ip: string, reason: string) {
  if (ip === "unknown") return;
  const ttlSeconds = Math.max(1, Math.ceil(dynamicBlacklistTtlMs / 1000));
  await redis.set(await redisKey("blacklist", "ip", ip), reason, { ex: ttlSeconds });
}

async function incrementRateLimit(redis: Redis, policy: RoutePolicy, identityValue: string, identityLabel: string) {
  const key = await redisKey("bucket", policy.id, identityValue);
  const windowSeconds = Math.max(1, Math.ceil(policy.windowMs / 1000));
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  let ttl = await redis.ttl(key);
  if (ttl < 0) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }

  const resetAt = Date.now() + Math.max(0, ttl) * 1000;
  const remaining = Math.max(0, policy.maxRequests - count);

  return {
    allowed: count <= policy.maxRequests,
    count,
    resetAt,
    remaining,
    retryAfterSeconds: Math.max(1, ttl),
    limitedBy: identityLabel,
  } satisfies RateLimitResult;
}

async function incrementViolation(redis: Redis, policy: RoutePolicy, identityValue: string) {
  const key = await redisKey("violations", policy.id, identityValue);
  const ttlSeconds = Math.max(1, Math.ceil(dynamicBlacklistTtlMs / 1000));
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttlSeconds);
  return count;
}

async function enforceRateLimit(
  request: NextRequest,
  policy: RoutePolicy,
  context: GatewayContext,
  ip: string
) {
  const redisState = getRedisState();
  if (!redisState.client) {
    return rateLimitStoreUnavailable(
      policy,
      redisState.reason ?? "Rate limiting is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      "Rate limiting is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN."
    );
  }

  const redis = redisState.client;
  try {
    const dynamicEntry = await checkDynamicBlacklist(redis, ip);
    if (dynamicEntry) {
      return gatewayJson({
        error: "Request temporarily blocked",
        code: "dynamic_blacklist",
        reason: dynamicEntry.reason,
        retryAfterSeconds: dynamicEntry.retryAfterSeconds,
      }, 403, { "Retry-After": String(dynamicEntry.retryAfterSeconds) });
    }

    const identity = getIdentity(policy, context, ip);
    const result = await incrementRateLimit(redis, policy, identity.value, identity.label);
    const headers = rateLimitHeaders(policy, result);

    if (isCaptchaConfigured() && policy.captchaAfter && result.count > policy.captchaAfter) {
      const token = readCaptchaToken(request);
      if (!token) {
        return gatewayJson({
          error: "Additional verification required",
          code: "captcha_required",
          provider: "turnstile",
        }, 403, headers);
      }

      const captcha = await verifyTurnstile(token, ip);
      if (!captcha.ok) {
        return gatewayJson({ error: "CAPTCHA verification failed", code: "captcha_failed", reason: captcha.reason }, 403, headers);
      }
    }

    if (result.allowed) return null;

    const allowDynamicBlacklist = policy.dynamicBlacklist !== false && !policy.trustedSystem && policy.blacklistAfter > 0;
    if (allowDynamicBlacklist) {
      const violations = await incrementViolation(redis, policy, identity.value);
      if (violations >= policy.blacklistAfter) {
        await addDynamicBlacklist(redis, ip, `rate_limit:${policy.id}`);
      }
    }

    return gatewayJson({
      error: "Too many requests",
      code: "rate_limited",
      retryAfterSeconds: result.retryAfterSeconds,
      policy: policy.id,
    }, 429, {
      ...headers,
      "Retry-After": String(result.retryAfterSeconds),
    });
  } catch (error) {
    return rateLimitStoreUnavailable(
      policy,
      error instanceof Error ? error.message : "Redis command failed"
    );
  }
}

export async function guardApiRequest(request: NextRequest, context: GatewayContext = {}) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return null;

  const ip = getClientIp(request);
  const policy = getRoutePolicy(pathname);
  const staticBlacklist = getStaticBlacklist();
  const phase = context.phase ?? "post-auth";

  if (staticBlacklist.has(ip)) {
    return gatewayJson({ error: "Request blocked", code: "static_blacklist" }, 403);
  }

  if (request.headers.has("x-middleware-subrequest")) {
    const redisState = getRedisState();
    if (redisState.client) {
      await addDynamicBlacklist(redisState.client, ip, "middleware_subrequest_header").catch((error) => {
        console.warn("[api-gateway] Unable to persist suspicious header blacklist:", error instanceof Error ? error.message : String(error));
      });
    }
    return gatewayJson({ error: "Request blocked", code: "suspicious_header" }, 403);
  }

  if (policy.methods && !policy.methods.includes(request.method)) {
    return gatewayJson({ error: "Method not allowed", code: "method_not_allowed" }, 405);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (policy.maxBodyBytes && contentLength > policy.maxBodyBytes) {
    return gatewayJson({ error: "Request body too large", code: "body_too_large" }, 413);
  }

  if (!shouldRateLimitInPhase(policy, phase)) return null;

  return enforceRateLimit(request, policy, context, ip);
}
