import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildGmailAuthUrl, getGoogleRedirectUri } from "@/lib/email-connector/google";

const STATE_COOKIE = "workhat_gmail_oauth_state";

function onboardingRedirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/onboarding", req.url);
  url.searchParams.set("step", "inbox");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", "/onboarding");
    return NextResponse.redirect(loginUrl);
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (appUserError) {
    return onboardingRedirect(req, { emailError: "Unable to verify your workspace. Try again." });
  }

  if (!appUser) {
    return onboardingRedirect(req, {
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

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail connection failed.";
    return onboardingRedirect(req, { emailError: message });
  }
}
