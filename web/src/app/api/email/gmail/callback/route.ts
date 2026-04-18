import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { encryptSecret } from "@/lib/email-connector/encryption";
import {
  exchangeGmailCode,
  fetchGmailProfile,
  getGoogleRedirectUri,
  GMAIL_PROVIDER,
  tokenExpiryDate,
  watchGmailInbox,
} from "@/lib/email-connector/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STATE_COOKIE = "workhat_gmail_oauth_state";
const RETURN_TO_COOKIE = "workhat_gmail_oauth_return_to";
const CONNECTOR_NOT_READY_MESSAGE = "Gmail connection is not ready yet. Please contact your Work Hat administrator.";

type ProviderMetadata = Record<string, unknown>;

function getSafeReturnTo(req: NextRequest) {
  const returnTo = req.cookies.get(RETURN_TO_COOKIE)?.value;
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) {
    return "/onboarding?step=inbox";
  }

  return returnTo;
}

function connectorRedirect(req: NextRequest, params: Record<string, string>) {
  const url = new URL(getSafeReturnTo(req), req.url);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(RETURN_TO_COOKIE);
  return response;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const providerError = params.get("error");
  if (providerError) {
    return connectorRedirect(req, {
      emailError: "Google sign-in was cancelled or access was not approved. Please try again when you are ready.",
    });
  }

  const state = params.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return connectorRedirect(req, { emailError: "Gmail connection expired. Try again." });
  }

  const code = params.get("code");
  if (!code) {
    return connectorRedirect(req, { emailError: "Google sign-in did not finish. Please try again." });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return connectorRedirect(req, { emailError: "Sign in before connecting Gmail." });
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[gmail/callback] admin client init failed:", error);
    return connectorRedirect(req, { emailError: CONNECTOR_NOT_READY_MESSAGE });
  }

  const appUser = await getCurrentAppUser({ label: "gmail/callback", select: "id, org_id, role" });
  if (!appUser) {
    return connectorRedirect(req, {
      emailError: "Create your organization before connecting Gmail.",
    });
  }

  if (!["admin", "manager"].includes(appUser.role)) {
    return connectorRedirect(req, {
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

    const { data: existing, error: existingError } = await db
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
      return connectorRedirect(req, {
        emailError: "Google did not return a refresh token. Reconnect and approve offline access.",
      });
    }

    const providerMetadata: ProviderMetadata = {
      gmail_profile: profile,
      token_type: token.token_type,
    };

    const { data: connection, error: connectionError } = await db
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

    const { data: channel, error: channelError } = await db
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
      const { error: channelUpdateError } = await db
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
      const { error: channelInsertError } = await db.from("channels").insert({
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
        const { error: watchUpdateError } = await db
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
        const { error: watchErrorUpdateError } = await db
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

    return connectorRedirect(req, { connected: GMAIL_PROVIDER });
  } catch (error) {
    console.error("[gmail/callback] OAuth callback failed:", error);
    return connectorRedirect(req, { emailError: CONNECTOR_NOT_READY_MESSAGE });
  }
}
