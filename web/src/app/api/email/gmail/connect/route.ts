import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import { buildGmailAuthUrl, getGoogleRedirectUri } from "@/lib/email-connector/google";

const STATE_COOKIE = "workhat_gmail_oauth_state";
const RETURN_TO_COOKIE = "workhat_gmail_oauth_return_to";
const CONNECTOR_NOT_READY_MESSAGE =
  "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then add the Gmail OAuth callback URL in Google Cloud.";

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

  const appUser = await getCurrentAppUser({ label: "gmail/connect", select: "id, org_id, role" });
  if (!appUser) {
    return connectorRedirect(req, {
      emailError: "Create your organization before connecting Gmail.",
    });
  }

  if (!(await hasCapability(appUser, "integrations.manage", "gmail/connect"))) {
    return connectorRedirect(req, {
      emailError: "Only admins and managers can connect shared inboxes.",
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
    console.error("[gmail/connect] OAuth setup failed:", error);
    const message = error instanceof Error ? error.message : CONNECTOR_NOT_READY_MESSAGE;
    return connectorRedirect(req, { emailError: message });
  }
}
