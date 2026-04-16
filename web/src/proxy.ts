import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applyApiGatewayHeaders, guardApiRequest } from "@/lib/security/api-gateway";

/**
 * Next.js 16 proxy (replaces middleware.ts).
 *
 * Public routes pass through freely.
 * All other routes require a valid Supabase session:
 *   - Unauthenticated API requests -> 401 JSON
 *   - Unauthenticated page requests -> redirect to /login?next=<pathname>
 * Already-signed-in users hitting /login -> redirect to /inbox
 */

type CookieItem = { name: string; value: string; options?: Record<string, unknown> };

// Exact public paths
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/onboarding", "/pricing"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api/inbound/")) return true;
  if (pathname.startsWith("/api/stripe/webhook")) return true;
  if (pathname.startsWith("/api/waitlist")) return true;
  if (pathname.startsWith("/checkout/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const gatewayResponse = await guardApiRequest(request);
  if (gatewayResponse) return gatewayResponse;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2]
            )
          );
        },
      },
    }
  );

  // Always use getUser() because it validates against the Supabase Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Always let public routes through.
  if (isPublic(pathname)) {
    // Redirect already-signed-in users away from /login.
    if (user && pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/inbox";
      return applyApiGatewayHeaders(NextResponse.redirect(url));
    }
    return applyApiGatewayHeaders(supabaseResponse);
  }

  // Protected route with no session.
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return applyApiGatewayHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return applyApiGatewayHeaders(NextResponse.redirect(loginUrl));
  }

  return applyApiGatewayHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
