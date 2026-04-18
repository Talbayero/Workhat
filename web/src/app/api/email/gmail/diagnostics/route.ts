import { NextResponse } from "next/server";
import { createOptionalAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type DiagnosticStatus = "pass" | "warn" | "fail";

type DiagnosticCheck = {
  key: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
};

async function getAppUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, org_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[gmail/diagnostics] app user lookup failed:", error.message);
    return null;
  }

  return data as { id: string; org_id: string; role: string } | null;
}

function checkEnv(name: string, label: string, missingMessage: string, validator?: (value: string) => DiagnosticCheck) {
  const value = process.env[name];
  if (!value) {
    return {
      key: name,
      label,
      status: "fail" as const,
      message: missingMessage,
    };
  }

  return validator?.(value) ?? {
    key: name,
    label,
    status: "pass" as const,
    message: "Configured.",
  };
}

function checkEncryptionKey(value: string): DiagnosticCheck {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length === 32) {
      return {
        key: "EMAIL_TOKEN_ENCRYPTION_KEY",
        label: "Token encryption key",
        status: "pass",
        message: "Configured as a 32-byte base64 key.",
      };
    }
  } catch {
    // Plain text secrets are supported through hashing below.
  }

  if (value.length >= 32) {
    return {
      key: "EMAIL_TOKEN_ENCRYPTION_KEY",
      label: "Token encryption key",
      status: "warn",
      message: "Configured as a text secret. This works, but a 32-byte base64 key is preferred.",
    };
  }

  return {
    key: "EMAIL_TOKEN_ENCRYPTION_KEY",
    label: "Token encryption key",
    status: "warn",
    message: "Configured, but short. Use a long random value before onboarding real customers.",
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

  if (state.reason === "invalid_service_role_key") {
    return {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Supabase admin key",
      status: "fail",
      message: `Configured key is not privileged${state.keyRole ? ` (${state.keyRole})` : ""}. Use sb_secret_... or the legacy service_role key.`,
    };
  }

  return {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase admin key",
    status: "fail",
    message: "Required for Gmail sync, push imports, and server-side mailbox operations.",
  };
}

export async function GET() {
  const appUser = await getAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "manager"].includes(appUser.role)) {
    return NextResponse.json({ error: "Only admins and managers can view connector diagnostics." }, { status: 403 });
  }

  const checks: DiagnosticCheck[] = [
    checkEnv("NEXT_PUBLIC_SUPABASE_URL", "Supabase project URL", "Required for all database operations."),
    checkSupabaseAdmin(),
    checkEnv("GOOGLE_CLIENT_ID", "Google OAuth client ID", "Required before users can connect Gmail.", (value) => ({
      key: "GOOGLE_CLIENT_ID",
      label: "Google OAuth client ID",
      status: value.endsWith(".apps.googleusercontent.com") ? "pass" : "warn",
      message: value.endsWith(".apps.googleusercontent.com")
        ? "Configured."
        : "Configured, but it does not look like a standard Google OAuth web client id.",
    })),
    checkEnv("GOOGLE_CLIENT_SECRET", "Google OAuth client secret", "Required for OAuth token exchange."),
    checkEnv("EMAIL_TOKEN_ENCRYPTION_KEY", "Token encryption key", "Required to encrypt Gmail access and refresh tokens.", checkEncryptionKey),
    checkEnv("GOOGLE_PUBSUB_TOPIC", "Google Pub/Sub topic", "Required before Gmail live watch can be enabled.", (value) => ({
      key: "GOOGLE_PUBSUB_TOPIC",
      label: "Google Pub/Sub topic",
      status: value.startsWith("projects/") && value.includes("/topics/") ? "pass" : "warn",
      message: value.startsWith("projects/") && value.includes("/topics/")
        ? "Configured."
        : "Expected format: projects/{project-id}/topics/{topic-name}.",
    })),
    checkEnv("GMAIL_PUSH_TOKEN", "Gmail push verification token", "Required to protect the Pub/Sub push endpoint.", (value) => ({
      key: "GMAIL_PUSH_TOKEN",
      label: "Gmail push verification token",
      status: value.length >= 24 ? "pass" : "warn",
      message: value.length >= 24 ? "Configured." : "Configured, but short. Use a long random value.",
    })),
    checkEnv("CRON_SECRET", "Vercel Cron secret", "Required to protect Gmail watch renewal cron.", (value) => ({
      key: "CRON_SECRET",
      label: "Vercel Cron secret",
      status: value.length >= 24 ? "pass" : "warn",
      message: value.length >= 24 ? "Configured." : "Configured, but short. Use a long random value.",
    })),
    checkEnv("NEXT_PUBLIC_APP_URL", "Public app URL", "Recommended so Google OAuth redirect URIs are stable in production.", (value) => ({
      key: "NEXT_PUBLIC_APP_URL",
      label: "Public app URL",
      status: /^https:\/\/.+/.test(value) ? "pass" : "warn",
      message: /^https:\/\/.+/.test(value)
        ? "Configured."
        : "Use your production HTTPS URL, for example https://work-hat.com.",
    })),
  ];

  const summary = {
    pass: checks.filter((check) => check.status === "pass").length,
    warn: checks.filter((check) => check.status === "warn").length,
    fail: checks.filter((check) => check.status === "fail").length,
  };

  return NextResponse.json({ checks, summary });
}
