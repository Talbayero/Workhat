import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const locales = ["en", "es"];
const defaultLocale = "en";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Only apply to marketing routes
  const isMarketingRoute = pathname === "/" || pathname === "/pricing" || pathname === "/compare";
  
  if (isMarketingRoute) {
    const url = request.nextUrl.clone();
    url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/", "/pricing", "/compare"],
};
