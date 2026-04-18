import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGmailAuthUrl, getGoogleRedirectUri } from "@/lib/email-connector/google";

const STATE_COOKIE = "workhat_gmail_oauth_state";
const RETURN_TO_COOKIE = "workhat_gmail_oauth_return_to";

function getSafeReturnTo(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? req.nextUrl.searchParams.get("next");
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) {
    return "/onboarding?step=inbox";
  }

  return returnTo;
}

function connectorRedirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL(getSafeReturnTo(req), req.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const returnTo = getSafeReturnTo(req);

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", `/api/email/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`);
    return NextResponse.redirect(loginUrl);
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (appUserError) {
    return connectorRedirect(req, { emailError: "Unable to verify your workspace. Try again." });
  }

  if (!appUser) {
    return connectorRedirect(req, {
      emailError: "Create your organization before connecting Gmail.",
    });
  }

  try {
    const state = randomBytes(32).toString("base64url");
    const authUrl = buildGmailAuthUrl({
      redirectUri: getGoogleRedirectUri(req),
      state,
    });

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    response.cookies.set(RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail connection failed.";
    return connectorRedirect(req, { emailError: message });
  }
}
