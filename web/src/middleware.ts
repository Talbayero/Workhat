import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applyApiGatewayHeaders, guardApiRequest } from "@/lib/security/api-gateway";

/**
 * Next.js middleware — runs on every non-static request.
 *
 * Responsibilities (in order):
 *   1. API gateway — rate limiting, IP blacklisting, body-size caps
 *   2. Session refresh — re-issue expiring Supabase cookies so every server
 *      component in this request reads a valid session
 *   3. Auth routing:
 *       - Public routes pass through freely
 *       - Unauthenticated API requests → 401 JSON
 *       - Unauthenticated page requests → /login?next=<path>
 *       - Authenticated users on /login → /inbox
 */

type CookieItem = { name: string; value: string; options?: Record<string, unknown> };

// ── Route classification ─────────────────────────────────────────────────────

/** Paths that do NOT require authentication. */
function isPublic(pathname: string): boolean {
  // Marketing / landing
  if (pathname === "/" || pathname === "/pricing" || pathname === "/compare") return true;
  // Internationalized marketing routes (/en/..., /es/...)
  if (pathname.match(/^\/(en|es)(\/|$)/)) return true;
  // Auth flows (magic link, OAuth callback)
  if (pathname.startsWith("/auth/")) return true;
  // Demo routes (no auth needed)
  if (pathname.startsWith("/demo/")) return true;
  // Public API routes
  if (pathname.startsWith("/api/inbound/")) return true;
  if (pathname.startsWith("/api/stripe/webhook")) return true;
  if (pathname.startsWith("/api/waitlist")) return true;
  if (pathname.startsWith("/api/email/gmail/")) return true; // OAuth connect/callback flow
  // Login page itself
  if (pathname === "/login") return true;
  return false;
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. API gateway (rate limits, blacklists, body-size caps) ───────────────
  const gatewayResponse = await guardApiRequest(request);
  if (gatewayResponse) return gatewayResponse;

  // ── 2. Session refresh via Supabase ────────────────────────────────────────
  // We need a mutable response object so Supabase can write refreshed cookies.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  // IMPORTANT: always use getUser() — it validates against the Supabase Auth
  // server. Never use getSession() here; it only reads the local cookie and
  // can be spoofed by a crafted cookie value.
  const { data: { user } } = await supabase.auth.getUser();

  // ── 3. Auth routing ────────────────────────────────────────────────────────

  // Redirect authenticated users away from the login page.
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/inbox";
    url.search = "";
    return applyApiGatewayHeaders(NextResponse.redirect(url));
  }

  // Public routes always pass through.
  if (isPublic(pathname)) {
    return applyApiGatewayHeaders(response);
  }

  // Protected route — no valid session.
  if (!user) {
    if (pathname.startsWith("/api/")) {
      // API callers expect JSON, not an HTML redirect.
      return applyApiGatewayHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    // Page route — redirect to /login preserving the intended destination.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applyApiGatewayHeaders(NextResponse.redirect(loginUrl));
  }

  return applyApiGatewayHeaders(response);
}

// Run on all routes except static assets and Next.js internals.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|otf|css|js)$).*)",
  ],
};
