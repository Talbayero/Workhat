/**
 * Next.js middleware — auth guard for all app routes.
 *
 * Rules:
 *   - Public routes (/login, /auth/*, /api/inbound/*) pass through freely.
 *   - All other routes require a valid Supabase session.
 *   - Unauthenticated requests to app pages are redirected to /login.
 *   - Unauthenticated requests to protected API routes get a 401 JSON response.
 *   - The Supabase session cookie is refreshed on every request so it stays alive.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that don't require authentication
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/onboarding", "/pricing"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Auth callback, inbound webhooks, Next internals, public API
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api/inbound/")) return true;
  if (pathname.startsWith("/api/waitlist")) return true;
  if (pathname.startsWith("/checkout/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always let public paths through
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Build a response we can mutate cookies on (required by @supabase/ssr)
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]
        ) {
          // Write cookies onto the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild response so Set-Cookie headers reach the browser
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  // Refresh session — this is the correct way per Supabase SSR docs.
  // getUser() validates the JWT with the Supabase server, not just the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes: return 401 JSON rather than redirecting
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // App pages: redirect to login, preserving the intended destination
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next.js static files and image optimisation.
     * We handle the finer-grained public/private logic inside the function.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
