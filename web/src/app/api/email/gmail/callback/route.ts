import { NextRequest, NextResponse } from "next/server";
import { encryptSecret } from "@/lib/email-connector/encryption";
import {
  exchangeGmailCode,
  fetchGmailProfile,
  getGoogleRedirectUri,
  GMAIL_PROVIDER,
  tokenExpiryDate,
  watchGmailInbox,
} from "@/lib/email-connector/google";
import { createClient } from "@/lib/supabase/server";

const STATE_COOKIE = "workhat_gmail_oauth_state";

type AppUser = {
  id: string;
  org_id: string;
  role: string;
};

type ProviderMetadata = Record<string, unknown>;

function onboardingRedirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/onboarding", req.url);
  url.searchParams.set("step", "inbox");
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  return response;
}

async function getAppUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[gmail/callback] app user lookup failed:", error.message);
    return null;
  }

  return data as AppUser | null;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const providerError = params.get("error");
  if (providerError) {
    return onboardingRedirect(req, { emailError: `Google denied access: ${providerError}` });
  }

  const state = params.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return onboardingRedirect(req, { emailError: "Gmail connection expired. Try again." });
  }

  const code = params.get("code");
  if (!code) {
    return onboardingRedirect(req, { emailError: "Google did not return an authorization code." });
  }

  const supabase = await createClient();
  const appUser = await getAppUser(supabase);
  if (!appUser) {
    return onboardingRedirect(req, {
      emailError: "Create your organization before connecting Gmail.",
    });
  }

  if (!["admin", "manager"].includes(appUser.role)) {
    return onboardingRedirect(req, {
      emailError: "Only admins and managers can connect shared inboxes.",
    });
  }

  try {
    const token = await exchangeGmailCode({
      code,
      redirectUri: getGoogleRedirectUri(req),
    });
    const profile = await fetchGmailProfile(token.access_token);
    const email = profile.emailAddress.toLowerCase();

    const { data: existing, error: existingError } = await supabase
      .from("email_connections")
      .select("id, refresh_token_ciphertext")
      .eq("org_id", appUser.org_id)
      .eq("provider", GMAIL_PROVIDER)
      .eq("provider_account_email", email)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const refreshTokenCiphertext = token.refresh_token
      ? encryptSecret(token.refresh_token)
      : (existing as { refresh_token_ciphertext?: string } | null)?.refresh_token_ciphertext;

    if (!refreshTokenCiphertext) {
      return onboardingRedirect(req, {
        emailError: "Google did not return a refresh token. Reconnect and approve offline access.",
      });
    }

    const providerMetadata: ProviderMetadata = {
      gmail_profile: profile,
      token_type: token.token_type,
    };

    const { data: connection, error: connectionError } = await supabase
      .from("email_connections")
      .upsert({
        org_id: appUser.org_id,
        created_by_user_id: appUser.id,
        provider: GMAIL_PROVIDER,
        provider_account_email: email,
        display_name: email,
        status: "connected",
        sync_status: "idle",
        access_token_ciphertext: encryptSecret(token.access_token),
        refresh_token_ciphertext: refreshTokenCiphertext,
        token_expires_at: tokenExpiryDate(token.expires_in).toISOString(),
        scopes: token.scope?.split(" ") ?? [],
        last_history_id: profile.historyId ?? null,
        error_message: null,
        provider_metadata: providerMetadata,
      }, {
        onConflict: "org_id,provider,provider_account_email",
      })
      .select("id")
      .single();

    if (connectionError || !connection) {
      throw new Error(connectionError?.message ?? "Failed to save Gmail connection.");
    }

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("id, config_json")
      .eq("org_id", appUser.org_id)
      .eq("type", "email")
      .maybeSingle();

    if (channelError) {
      throw new Error(channelError.message);
    }

    const channelConfig = {
      ...((channel as { config_json?: Record<string, unknown> } | null)?.config_json ?? {}),
      direct_connection_provider: GMAIL_PROVIDER,
      direct_connection_id: connection.id,
      provider_account_email: email,
      support_email: email,
    };

    if (channel) {
      const { error: channelUpdateError } = await supabase
        .from("channels")
        .update({
          provider: GMAIL_PROVIDER,
          status: "active",
          config_json: channelConfig,
        })
        .eq("id", (channel as { id: string }).id);

      if (channelUpdateError) {
        throw new Error(channelUpdateError.message);
      }
    } else {
      const { error: channelInsertError } = await supabase.from("channels").insert({
        org_id: appUser.org_id,
        type: "email",
        provider: GMAIL_PROVIDER,
        status: "active",
        config_json: channelConfig,
      });

      if (channelInsertError) {
        throw new Error(channelInsertError.message);
      }
    }

    const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
    if (topicName) {
      try {
        const watch = await watchGmailInbox({ accessToken: token.access_token, topicName });
        const expiration = new Date(Number(watch.expiration)).toISOString();
        const { error: watchUpdateError } = await supabase
          .from("email_connections")
          .update({
            sync_status: "watching",
            watch_expires_at: expiration,
            last_history_id: watch.historyId,
            error_message: null,
            provider_metadata: {
              ...providerMetadata,
              gmail_watch: {
                topic_name: topicName,
                registered_at: new Date().toISOString(),
                expiration,
                source: "oauth_callback",
              },
            },
          })
          .eq("id", connection.id);

        if (watchUpdateError) {
          throw new Error(watchUpdateError.message);
        }
      } catch (watchError) {
        const watchMessage = watchError instanceof Error ? watchError.message : "Gmail live watch setup failed.";
        const { error: watchErrorUpdateError } = await supabase
          .from("email_connections")
          .update({
            sync_status: "idle",
            error_message: `Gmail connected, but live watch setup failed: ${watchMessage}`,
            provider_metadata: {
              ...providerMetadata,
              gmail_watch_error: {
                message: watchMessage,
                occurred_at: new Date().toISOString(),
                source: "oauth_callback",
              },
            },
          })
          .eq("id", connection.id);

        if (watchErrorUpdateError) {
          console.warn("[gmail/callback] failed to persist watch error:", watchErrorUpdateError.message);
        }
      }
    }

    return onboardingRedirect(req, { connected: GMAIL_PROVIDER });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail connection failed.";
    return onboardingRedirect(req, { emailError: message });
  }
}
