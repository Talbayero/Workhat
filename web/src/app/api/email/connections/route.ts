import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { validateAndActivateMailboxConnection, type MailboxConnectionRecord } from "@/lib/email-connector/adapters";
import { classifyMailboxError } from "@/lib/email-connector/adapters/errors";
import {
  providerHasDefaultMailSettings,
  providerNeedsAppPasswordHint,
} from "@/lib/email-connector/adapters/provider-config";
import { encryptSecret } from "@/lib/email-connector/encryption";
import { logAudit } from "@/lib/security/audit-logger";
import { createAdminClient } from "@/lib/supabase/admin";

type CredentialConnectionType = "mailbox_password" | "app_password" | "imap_smtp";
type MailboxProvider = "gmail" | "microsoft365" | "outlook" | "exchange" | "zoho" | "icloud" | "custom";

const CREDENTIAL_METHODS = new Set(["mailbox_password", "app_password", "imap_smtp"]);
const PROVIDERS = new Set(["gmail", "microsoft365", "outlook", "exchange", "zoho", "icloud", "custom"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function boolField(body: Record<string, unknown>, key: string, fallback: boolean) {
  const value = body[key];
  return typeof value === "boolean" ? value : fallback;
}

function portField(body: Record<string, unknown>, key: string, fallback: number) {
  const value = stringField(body, key);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : Number.NaN;
}

function normalizeProviderToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeMailboxProvider({
  email,
  providerHint,
  imapHost = "",
  smtpHost = "",
}: {
  email: string;
  providerHint: string;
  imapHost?: string;
  smtpHost?: string;
}): MailboxProvider {
  const token = normalizeProviderToken(providerHint);
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const hostText = `${imapHost} ${smtpHost}`.toLowerCase();

  if (["gmail", "google", "googleworkspace"].includes(token) || domain === "gmail.com" || domain === "googlemail.com") {
    return "gmail";
  }
  if (["microsoft365", "m365", "office365"].includes(token)) return "microsoft365";
  if (
    ["outlook", "hotmail", "live"].includes(token) ||
    ["outlook.com", "hotmail.com", "live.com"].includes(domain)
  ) {
    return "outlook";
  }
  if (token === "exchange" || hostText.includes("exchange")) return "exchange";
  if (token === "zoho" || domain.includes("zoho.") || hostText.includes("zoho.")) return "zoho";
  if (["icloud", "apple"].includes(token) || domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return "icloud";
  }
  if (PROVIDERS.has(token)) return token as MailboxProvider;
  return "custom";
}

function encryptionUnavailableResponse() {
  return NextResponse.json(
    {
      error: "Mailbox credential storage is not configured.",
      hint: "Ask a workspace administrator to finish secure mailbox credential storage before using password, app password, or IMAP/SMTP setup.",
    },
    { status: 503 }
  );
}

function isConnectionSchemaError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("email_connections_provider_check") ||
    normalized.includes("email_connections_status_check") ||
    normalized.includes("email_connections_sync_status_check") ||
    normalized.includes("email_connections_connection_type_check") ||
    normalized.includes("email_connections_org_provider_account_type_key") ||
    normalized.includes("connection_type") ||
    normalized.includes("schema cache")
  );
}

function connectionSchemaUnavailableResponse() {
  return NextResponse.json(
    {
      error: "Mailbox connection schema is out of date.",
      hint: "Apply migrations through 0040_email_connection_normalization_repair.sql so Work Hat can normalize provider, connection type, lifecycle status, and runtime sync state safely.",
    },
    { status: 503 }
  );
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "email/connections" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Email connection metadata (token expiry, history IDs, sync errors) is sensitive
  // infrastructure detail. Restrict to admin and manager — agents and qa_reviewers
  // have no legitimate need to see OAuth connection state.
  const denied = await requireCapability(appUser, "integrations.manage", "email/connections");
  if (denied) return denied;

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[email/connections] admin client init failed:", error);
    return NextResponse.json({ error: "Email connector is unavailable." }, { status: 503 });
  }

  const { data, error } = await db
    .from("email_connections")
    .select(
      "id, provider, connection_type, provider_account_email, display_name, status, sync_status, token_expires_at, last_history_id, watch_expires_at, last_sync_at, error_message, provider_metadata, created_at, updated_at"
      + ", inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, diagnostics_json, credential_metadata"
    )
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[email/connections] list query failed:", error.message);
    return NextResponse.json({ error: "Unable to load email connections." }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "email/connections" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = await requireCapability(appUser, "integrations.manage", "email/connections");
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const connectionType = stringField(body, "method") as CredentialConnectionType;
  if (!CREDENTIAL_METHODS.has(connectionType)) {
    return NextResponse.json(
      { error: "Connection method must be mailbox_password, app_password, or imap_smtp." },
      { status: 422 }
    );
  }

  const email = stringField(body, "email").toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "A valid mailbox email is required." }, { status: 422 });
  }

  const providerHint = stringField(body, "providerHint").toLowerCase();
  const senderName = stringField(body, "senderName");
  const now = new Date().toISOString();
  let credential: string;
  let displayName = senderName || email;
  let metadata: Record<string, unknown>;
  let provider: MailboxProvider;

  if (connectionType === "mailbox_password") {
    const password = stringField(body, "password");
    if (!password) {
      return NextResponse.json({ error: "Mailbox password is required." }, { status: 422 });
    }
    credential = password;
    provider = normalizeMailboxProvider({ email, providerHint });
    if (providerNeedsAppPasswordHint(provider, connectionType)) {
      return NextResponse.json(
        {
          error: "This provider requires OAuth or an app password.",
          hint: "Use OAuth when available, or create a provider-issued app password and choose App password setup.",
        },
        { status: 422 }
      );
    }
    if (!providerHasDefaultMailSettings(provider)) {
      return NextResponse.json(
        {
          error: "This provider requires IMAP and SMTP settings.",
          hint: "Choose IMAP / SMTP and enter the incoming and outgoing mail server settings from your mailbox provider.",
        },
        { status: 422 }
      );
    }
    metadata = {
      connection_type: connectionType,
      provider_hint: providerHint || null,
      provider,
      sender_name: senderName || null,
      credential_type: "mailbox_password",
      adapter_status: "pending",
      saved_at: now,
      saved_by_user_id: appUser.id,
    };
  } else if (connectionType === "app_password") {
    const appPassword = stringField(body, "appPassword");
    if (!appPassword) {
      return NextResponse.json({ error: "App password is required." }, { status: 422 });
    }
    credential = appPassword;
    provider = normalizeMailboxProvider({ email, providerHint });
    if (!providerHasDefaultMailSettings(provider)) {
      return NextResponse.json(
        {
          error: "This provider requires IMAP and SMTP settings.",
          hint: "Choose IMAP / SMTP and enter the incoming and outgoing mail server settings from your mailbox provider.",
        },
        { status: 422 }
      );
    }
    metadata = {
      connection_type: connectionType,
      provider_hint: providerHint || null,
      provider,
      sender_name: senderName || null,
      credential_type: "app_password",
      adapter_status: "pending",
      saved_at: now,
      saved_by_user_id: appUser.id,
    };
  } else {
    const username = stringField(body, "username");
    const password = stringField(body, "password");
    const imapHost = stringField(body, "imapHost").toLowerCase();
    const smtpHost = stringField(body, "smtpHost").toLowerCase();
    const imapPort = portField(body, "imapPort", 993);
    const smtpPort = portField(body, "smtpPort", 587);

    if (!username || !password || !imapHost || !smtpHost) {
      return NextResponse.json(
        { error: "Username, password, IMAP host, and SMTP host are required." },
        { status: 422 }
      );
    }
    if (Number.isNaN(imapPort) || Number.isNaN(smtpPort)) {
      return NextResponse.json({ error: "IMAP and SMTP ports must be valid port numbers." }, { status: 422 });
    }

    credential = password;
    displayName = senderName || username || email;
    provider = normalizeMailboxProvider({ email, providerHint, imapHost, smtpHost });
    metadata = {
      connection_type: connectionType,
      provider_hint: providerHint || null,
      provider,
      username,
      sender_name: senderName || null,
      imap: {
        host: imapHost,
        port: imapPort,
        ssl: boolField(body, "imapSsl", true),
      },
      smtp: {
        host: smtpHost,
        port: smtpPort,
        ssl: boolField(body, "smtpSsl", true),
      },
      credential_type: "mailbox_password",
      adapter_status: "pending",
      saved_at: now,
      saved_by_user_id: appUser.id,
    };
  }

  let encryptedCredential: string;
  try {
    encryptedCredential = encryptSecret(credential);
  } catch (error) {
    if (error instanceof Error && error.message.includes("EMAIL_TOKEN_ENCRYPTION_KEY")) {
      return encryptionUnavailableResponse();
    }
    console.error("[email/connections] credential encryption failed:", error);
    return NextResponse.json({ error: "Unable to protect mailbox credentials." }, { status: 500 });
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[email/connections] admin client init failed:", error);
    return NextResponse.json({ error: "Email connector is unavailable." }, { status: 503 });
  }

  const { data: existing, error: lookupError } = await db
    .from("email_connections")
    .select("id")
    .eq("org_id", appUser.org_id)
    .eq("provider", provider)
    .eq("provider_account_email", email)
    .eq("connection_type", connectionType)
    .maybeSingle();

  if (lookupError) {
    console.error("[email/connections] lookup failed:", lookupError.message);
    if (isConnectionSchemaError(lookupError.message)) {
      return connectionSchemaUnavailableResponse();
    }
    return NextResponse.json({ error: "Unable to check existing mailbox connection." }, { status: 500 });
  }

  const payload = {
    access_token_ciphertext: encryptedCredential,
    display_name: displayName,
    error_message: null,
    org_id: appUser.org_id,
    provider,
    connection_type: connectionType,
    provider_account_email: email,
    provider_metadata: metadata,
    credential_metadata: {
      username: connectionType === "imap_smtp" ? (metadata.username as string) : email,
      credential_type: connectionType === "app_password" ? "app_password" : "mailbox_password",
      stored_at: now,
    },
    refresh_token_ciphertext: null,
    status: "configured",
    sync_status: "idle",
    inbound_enabled: true,
    outbound_enabled: true,
    last_validated_at: null,
    last_error_code: null,
    last_error_message: null,
    diagnostics_json: {},
    token_expires_at: null,
    watch_expires_at: null,
  };

  const query = existing
    ? db.from("email_connections").update(payload).eq("id", existing.id).eq("org_id", appUser.org_id).select(
        "id, org_id, provider, connection_type, provider_account_email, display_name, status, sync_status, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, last_history_id, watch_expires_at, last_sync_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, error_message, diagnostics_json, credential_metadata, provider_metadata, created_at, updated_at"
      )
    : db.from("email_connections").insert(payload).select(
        "id, org_id, provider, connection_type, provider_account_email, display_name, status, sync_status, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, last_history_id, watch_expires_at, last_sync_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, error_message, diagnostics_json, credential_metadata, provider_metadata, created_at, updated_at"
      );

  const { data: saved, error } = await query.maybeSingle();
  if (error) {
    console.error("[email/connections] save failed:", error.message);
    if (isConnectionSchemaError(error.message)) {
      return connectionSchemaUnavailableResponse();
    }
    return NextResponse.json(
      { error: "Unable to save this mailbox connection.", hint: "Please verify the provider, mailbox address, and setup method." },
      { status: 500 }
    );
  }
  if (!saved) {
    return NextResponse.json({ error: "Unable to save this mailbox connection." }, { status: 500 });
  }

  await logAudit({
    action: "org.settings_updated",
    orgId: appUser.org_id,
    actorId: appUser.id,
    actorRole: appUser.role,
    resourceType: "email_connection",
    resourceId: saved?.id ?? null,
    resourceLabel: email,
    newValues: {
      provider,
      connectionType,
      status: "configured",
      credentialStored: true,
    },
    req,
  });

  let activation;
  try {
    activation = await validateAndActivateMailboxConnection({ db }, saved as MailboxConnectionRecord);
  } catch (error) {
    const classified = classifyMailboxError(error);
    console.error("[email/connections] activation failed:", classified.message);
    return NextResponse.json(
      {
        error: classified.message,
        code: classified.code,
        connection: saved,
      },
      { status: 422 }
    );
  }
  const { data: activated } = await db
    .from("email_connections")
    .select(
      "id, provider, connection_type, provider_account_email, display_name, status, sync_status, error_message, provider_metadata, created_at, updated_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, diagnostics_json, credential_metadata"
    )
    .eq("id", saved.id)
    .eq("org_id", appUser.org_id)
    .maybeSingle();

  if (!activation.ok) {
    return NextResponse.json(
      {
        error: activation.message,
        code: activation.code,
        connection: activated ?? saved,
        diagnostics: activation.diagnostics,
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ connection: activated ?? saved, diagnostics: activation.diagnostics });
}

export async function DELETE(req: NextRequest) {
  const appUser = await getCurrentAppUser({ label: "email/connections" });
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const denied = await requireCapability(appUser, "integrations.manage", "email/connections");
  if (denied) return denied;

  const connectionId = req.nextUrl.searchParams.get("connectionId");
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId is required" }, { status: 422 });
  }

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch (error) {
    console.error("[email/connections] admin client init failed:", error);
    return NextResponse.json({ error: "Email connector is unavailable." }, { status: 503 });
  }

  const { data, error } = await db
    .from("email_connections")
    .update({
      access_token_ciphertext: null,
      error_message: null,
      provider_metadata: {
        disconnected_at: new Date().toISOString(),
        disconnected_by: appUser.id,
      },
      refresh_token_ciphertext: null,
      status: "disconnected",
      sync_status: "idle",
      token_expires_at: null,
      watch_expires_at: null,
    })
    .eq("id", connectionId)
    .eq("org_id", appUser.org_id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[email/connections] disconnect update failed:", error.message);
    return NextResponse.json({ error: "Unable to disconnect this email account." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Email connection not found for this workspace." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
