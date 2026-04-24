import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const target = new URL("/api/email/gmail/connect", req.url);
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? req.nextUrl.searchParams.get("next");
  if (returnTo) {
    target.searchParams.set("returnTo", returnTo);
  }

  return NextResponse.redirect(target);
}
