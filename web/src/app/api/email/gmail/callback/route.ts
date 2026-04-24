import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { hasCapability } from "@/lib/auth/capabilities";
import { encryptSecret } from "@/lib/email/encryption";
import {
  importRecentGmailInbox,
  markGmailSyncSuccess,
  type EmailConnection,
} from "@/lib/email/gmail-importer";
import {
  exchangeGmailCode,
  fetchGmailProfile,
  getGoogleRedirectUri,
  GMAIL_PROVIDER,
  tokenExpiryDate,
  watchGmailInbox,
} from "@/lib/email/google";
import { logAudit } from "@/lib/security/audit-logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const STATE_COOKIE = "workhat_gmail_oauth_state";
const RETURN_TO_COOKIE = "workhat_gmail_oauth_return_to";
const CONNECTOR_NOT_READY_MESSAGE =
  "Admin setup required: Gmail OAuth is not configured";

type ProviderMetadata = Record<string, unknown>;
type GoogleOAuthState = {
  nonce?: string;
  orgId?: string;
  userId?: string;
  returnTo?: string;
  iat?: number;
};

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

function toOperatorError(error: unknown) {
  if (!(error instanceof Error)) return CONNECTOR_NOT_READY_MESSAGE;
  const message = error.message;
  if (message.includes("EMAIL_TOKEN_ENCRYPTION_KEY")) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  if (message.toLowerCase().includes("canonical app url")) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  if (
    message.includes("GOOGLE_CLIENT_ID") ||
    message.includes("GOOGLE_CLIENT_SECRET") ||
    message.includes("Google OAuth is not configured") ||
    message.includes("Work Hat platform Google OAuth is not configured")
  ) {
    return CONNECTOR_NOT_READY_MESSAGE;
  }
  if (message.includes("Google token exchange failed")) {
    return "Gmail connection failed during Google approval. Contact your Work Hat administrator.";
  }
  if (message.includes("redirect_uri_mismatch")) {
    return "Gmail connection failed because Work Hat's Google callback is not approved. Contact your Work Hat administrator.";
  }
  if (message.includes("access_denied")) {
    return "Google sign-in was cancelled or access was not approved.";
  }
  if (message.includes("not allowed") || message.includes("unauthorized_client")) {
    return "This Google account is not allowed for the Work Hat OAuth app. Contact your Work Hat administrator.";
  }
  if (message.includes("Gmail profile fetch failed")) {
    return "Gmail connected to Google but Work Hat could not read the mailbox profile. Verify Gmail API access and requested scopes.";
  }
  return message;
}

function decodeState(value: string): GoogleOAuthState | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as GoogleOAuthState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const providerError = params.get("error");
  if (providerError) {
    const description = params.get("error_description");
    return connectorRedirect(req, {
      emailError: toOperatorError(new Error([providerError, description].filter(Boolean).join(": "))),
    });
  }

  const state = params.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !expectedState || state !== expectedState) {
    return connectorRedirect(req, { emailError: "Gmail connection expired. Try again." });
  }
  const decodedState = decodeState(state);
  if (!decodedState?.orgId || !decodedState.userId || !decodedState.nonce) {
    return connectorRedirect(req, { emailError: "Gmail connection state is invalid. Try again." });
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

  if (!(await hasCapability(appUser, "integrations.manage", "gmail/callback"))) {
    return connectorRedirect(req, {
      emailError: "Only admins and managers can connect shared inboxes.",
    });
  }
  if (decodedState.orgId !== appUser.org_id || decodedState.userId !== appUser.id) {
    return connectorRedirect(req, { emailError: "Gmail connection state does not match your signed-in workspace." });
  }

  try {
    const redirectUri = getGoogleRedirectUri(req);
    console.info("[oauth/google/callback] redirect_uri:", redirectUri);
    const token = await exchangeGmailCode({
      code,
      redirectUri,
    });
    const profile = await fetchGmailProfile(token.access_token);
    const email = profile.emailAddress.toLowerCase();
    const encryptedAccessToken = encryptSecret(token.access_token);

    const { data: existing, error: existingError } = await db
      .from("email_connections")
      .select("id, refresh_token_ciphertext")
      .eq("org_id", appUser.org_id)
      .eq("provider", GMAIL_PROVIDER)
      .eq("provider_account_email", email)
      .eq("connection_type", "oauth")
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
      connection_type: "oauth",
      provider: GMAIL_PROVIDER,
      gmail_profile: profile,
      token_type: token.token_type,
    };

    const { data: connection, error: connectionError } = await db
      .from("email_connections")
      .upsert({
        org_id: appUser.org_id,
        created_by_user_id: appUser.id,
        provider: GMAIL_PROVIDER,
        connection_type: "oauth",
        provider_account_email: email,
        display_name: email,
        status: "active",
        sync_status: "idle",
        inbound_enabled: true,
        outbound_enabled: true,
        last_validated_at: new Date().toISOString(),
        access_token_ciphertext: encryptedAccessToken,
        refresh_token_ciphertext: refreshTokenCiphertext,
        token_expires_at: tokenExpiryDate(token.expires_in).toISOString(),
        scopes: token.scope?.split(" ") ?? [],
        last_history_id: profile.historyId ?? null,
        error_message: null,
        last_error_code: null,
        last_error_message: null,
        diagnostics_json: {
          status: "pass",
          provider: GMAIL_PROVIDER,
          connectionType: "oauth",
          nextAction: "Gmail OAuth is active.",
        },
        provider_metadata: providerMetadata,
      }, {
        onConflict: "org_id,provider,provider_account_email,connection_type",
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

    await logAudit({
      action: "org.settings_updated",
      orgId: appUser.org_id,
      actorId: appUser.id,
      actorRole: appUser.role,
      resourceType: "email_connection",
      resourceId: connection.id,
      resourceLabel: email,
      newValues: {
        provider: GMAIL_PROVIDER,
        connectionType: "oauth",
        status: "active",
        inboundEnabled: true,
        outboundEnabled: true,
      },
      req,
    });

    try {
      const importConnection: EmailConnection = {
        id: connection.id,
        org_id: appUser.org_id,
        provider_account_email: email,
        access_token_ciphertext: encryptedAccessToken,
        refresh_token_ciphertext: refreshTokenCiphertext,
        token_expires_at: tokenExpiryDate(token.expires_in).toISOString(),
        last_history_id: profile.historyId ?? null,
      };
      const importResult = await importRecentGmailInbox({
        db,
        connection: importConnection,
        maxResults: 10,
      });
      await markGmailSyncSuccess({ db, connectionId: connection.id, result: importResult });
    } catch (syncError) {
      const syncMessage = syncError instanceof Error ? syncError.message : "Initial Gmail sync failed.";
      console.error("[gmail/callback] initial sync failed:", syncMessage);
      const { error: syncUpdateError } = await db
        .from("email_connections")
        .update({
          status: "active",
          sync_status: "error",
          last_error_code: "initial_sync_failed",
          last_error_message: syncMessage,
          error_message: `Gmail connected, but initial import failed: ${syncMessage}`,
          diagnostics_json: {
            status: "warn",
            provider: GMAIL_PROVIDER,
            connectionType: "oauth",
            lastErrorCode: "initial_sync_failed",
            lastErrorMessage: syncMessage,
            nextAction: "Run Gmail sync from Settings after verifying Gmail API access.",
          },
        })
        .eq("id", connection.id);

      if (syncUpdateError) {
        console.warn("[gmail/callback] failed to persist initial sync error:", syncUpdateError.message);
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
            status: "active",
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
            status: "active",
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
    return connectorRedirect(req, { emailError: toOperatorError(error) });
  }
}

