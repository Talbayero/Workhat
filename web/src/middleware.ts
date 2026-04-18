import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type CookieItem = { name: string; value: string; options?: Record<string, unknown> };

// ── Route classification ────────────────────────────────────────────────────

/** Routes that only unauthenticated users should reach (redirect authed users away). */
const AUTH_ROUTES = new Set(["/login", "/onboarding"]);

/** Routes that require a valid session (unauthenticated users are redirected to /login). */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/inbox",
  "/contacts",
  "/companies",
  "/knowledge",
  "/search",
  "/settings",
  "/checkout",
];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Supabase requires a response object it can attach Set-Cookie headers to
  // when it refreshes an expiring session token.
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          // Write cookies onto the outgoing request so server components
          // that run after middleware can read the refreshed session.
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
          );
        },
      },
    }
  );

  // getUser() validates the session with Supabase auth server on every call
  // and refreshes the token if needed — never use getSession() here because
  // it only reads the local cookie without server-side validation.
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated → redirect to /login, preserving the intended destination.
  if (!user && isProtected(pathname)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated → redirect away from auth-only pages.
  if (user && AUTH_ROUTES.has(pathname)) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = "/inbox";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

// Only run on pages — skip API routes, static assets, and Next.js internals.
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|otf|css|js)$).*)",
  ],
};
