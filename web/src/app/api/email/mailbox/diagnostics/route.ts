import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { requireCapability } from "@/lib/auth/capabilities";
import { getMailboxDiagnostics, type MailboxConnectionRecord } from "@/lib/email/adapters";
import { createOptionalAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type DiagnosticStatus = "pass" | "warn" | "fail";

type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
};

const CONNECTION_SELECT =
  "id, org_id, provider, connection_type, provider_account_email, display_name, status, sync_status, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, scopes, last_history_id, watch_expires_at, last_sync_at, inbound_enabled, outbound_enabled, last_validated_at, last_inbound_sync_at, last_outbound_send_at, last_error_code, last_error_message, error_message, diagnostics_json, credential_metadata, provider_metadata";

function checkEnv(name: string, label: string, missingMessage: string, optional = false): DiagnosticCheck {
  const value = process.env[name];
  if (!value) {
    return {
      key: name,
      label,
      status: optional ? "warn" : "fail",
      message: missingMessage,
    };
  }

  return {
    key: name,
    label,
    status: "pass",
    message: "Configured.",
  };
}

function checkSupabaseAdmin(): DiagnosticCheck {
  const state = createOptionalAdminClient();
  if (state.client) {
    return {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Supabase admin key",
      status: "pass",
      message: state.keyRole === "secret" ? "Valid Supabase secret key detected." : "Valid service_role key detected.",
    };
  }

  return {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase admin key",
    status: "fail",
    message: "Required for server-side mailbox validation, inbound polling, and outbound sending.",
  };
}

export async function GET() {
  const appUser = await getCurrentAppUser({ label: "mailbox/diagnostics" });
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const denied = await requireCapability(appUser, "integrations.manage", "mailbox/diagnostics");
  if (denied) return denied;

  const adminState = createOptionalAdminClient();
  const baseChecks: DiagnosticCheck[] = [
    checkEnv("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL", "Required for database operations."),
    checkSupabaseAdmin(),
    checkEnv("EMAIL_TOKEN_ENCRYPTION_KEY", "Mailbox credential encryption key", "Required for OAuth tokens and password/app-password/IMAP credential storage."),
    checkEnv("CRON_SECRET", "Cron secret", "Required when mailbox polling is triggered by scheduled jobs.", true),
  ];

  if (!adminState.client) {
    const summary = {
      pass: baseChecks.filter((check) => check.status === "pass").length,
      warn: baseChecks.filter((check) => check.status === "warn").length,
      fail: baseChecks.filter((check) => check.status === "fail").length,
    };
    return NextResponse.json({ checks: baseChecks, connections: [], summary });
  }

  const { data, error } = await adminState.client
    .from("email_connections")
    .select(CONNECTION_SELECT)
    .eq("org_id", appUser.org_id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Unable to load mailbox diagnostics." }, { status: 500 });
  }

  const connections = await Promise.all(
    ((data ?? []) as MailboxConnectionRecord[]).map(async (connection) => ({
      id: connection.id,
      email: connection.provider_account_email,
      diagnostics: await getMailboxDiagnostics({ db: adminState.client! }, connection),
    }))
  );

  const connectionChecks = connections.flatMap((connection) => connection.diagnostics.checks);
  const checks = [...baseChecks, ...connectionChecks];
  const summary = {
    pass: checks.filter((check) => check.status === "pass").length,
    warn: checks.filter((check) => check.status === "warn").length,
    fail: checks.filter((check) => check.status === "fail").length,
  };

  return NextResponse.json({ checks, connections, summary });
}

