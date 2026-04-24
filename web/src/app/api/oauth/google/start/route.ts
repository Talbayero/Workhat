import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { buildGmailAuthUrl, getGoogleRedirectUri } from "@/lib/email/google";
import { createClient } from "@/lib/supabase/server";

const STATE_COOKIE = "workhat_gmail_oauth_state";
const RETURN_TO_COOKIE = "workhat_gmail_oauth_return_to";
const CONNECTOR_NOT_READY_MESSAGE =
  "Admin setup required: Gmail OAuth is not configured";

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

function encodeState(input: { nonce: string; orgId: string; userId: string; returnTo: string }) {
  return Buffer.from(JSON.stringify({
    ...input,
    iat: Date.now(),
  })).toString("base64url");
}

function toUserSetupError(error: unknown) {
  if (!(error instanceof Error)) return CONNECTOR_NOT_READY_MESSAGE;
  const message = error.message.toLowerCase();
  if (error.message.includes("GOOGLE_CLIENT_ID") || error.message.includes("GOOGLE_CLIENT_SECRET")) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  if (message.includes("canonical app url")) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  if (error.message.includes("Google OAuth is not configured")) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  if (error.message.includes("Work Hat platform Google OAuth is not configured")) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  return error.message;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const returnTo = getSafeReturnTo(req);

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", `/api/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`);
    return NextResponse.redirect(loginUrl);
  }

  const appUser = await getCurrentAppUser({ label: "oauth/google/start", select: "id, org_id, role" });
  if (!appUser) {
    return connectorRedirect(req, {
      emailError: "Create your organization before connecting Gmail.",
    });
  }

  if (!(await hasCapability(appUser, "integrations.manage", "oauth/google/start"))) {
    return connectorRedirect(req, {
      emailError: "Only admins and managers can connect shared inboxes.",
    });
  }

  try {
    const redirectUri = getGoogleRedirectUri(req);
    const state = encodeState({
      nonce: randomBytes(24).toString("base64url"),
      orgId: appUser.org_id,
      userId: appUser.id,
      returnTo,
    });
    const authUrl = buildGmailAuthUrl({ redirectUri, state });

    console.info("[oauth/google/start] redirect_uri:", redirectUri);

    const response = NextResponse.redirect(new URL(authUrl));
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
    console.error("[oauth/google/start] OAuth setup failed:", error);
    return connectorRedirect(req, { emailError: toUserSetupError(error) });
  }
}

