import "server-only";

import { createOptionalAdminClient } from "@/lib/supabase/admin";
import {
  AI_MODES,
  AI_PROVIDERS,
  DEFAULT_OPENAI_DRAFT_MODEL,
  SUPPORTED_OPENAI_MODELS,
  type AIMode,
  type AIProvider,
  type AISettingStatus,
} from "@/lib/ai-settings/constants";
import { decryptAIProviderKey, encryptAIProviderKey, keyHint } from "@/lib/ai-settings/encryption";

type Db = {
  from: (table: string) => unknown;
};

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  insert: (...args: unknown[]) => QueryBuilder;
  update: (...args: unknown[]) => QueryBuilder;
  upsert: (...args: unknown[]) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
};

type AISettingsRow = {
  org_id: string;
  ai_mode: AIMode;
  default_provider: AIProvider;
  default_model: string;
  status: AISettingStatus;
  last_validated_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AICredentialRow = {
  id: string;
  org_id: string;
  provider: AIProvider;
  encrypted_api_key: string;
  key_hint: string;
  status: "active" | "error" | "disabled";
  last_validated_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SafeOrgAISettings = {
  aiMode: AIMode;
  defaultProvider: AIProvider;
  defaultModel: string;
  status: AISettingStatus;
  lastValidatedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  platformManagedAvailable: boolean;
  supportedProviders: Array<{ provider: AIProvider; label: string; supported: true }>;
  supportedModels: string[];
  credential: {
    provider: AIProvider;
    keyHint: string;
    status: AICredentialRow["status"];
    lastValidatedAt: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
  } | null;
};

export type ResolvedAIConfig = {
  aiMode: Exclude<AIMode, "disabled">;
  provider: AIProvider;
  model: string;
  apiKey: string;
  source: "platform" | "byo";
  keyHint: string | null;
};

export class AISettingsError extends Error {
  constructor(
    readonly code:
      | "ai_disabled"
      | "ai_provider_not_configured"
      | "ai_provider_invalid_key"
      | "ai_provider_quota_exceeded"
      | "ai_provider_timeout"
      | "ai_model_unavailable"
      | "ai_provider_validation_failed",
    message: string,
    readonly status = 400,
    readonly hint?: string
  ) {
    super(message);
    this.name = "AISettingsError";
  }
}

function table(db: Db, name: string) {
  return db.from(name) as QueryBuilder;
}

function isAIMode(value: unknown): value is AIMode {
  return typeof value === "string" && (AI_MODES as readonly string[]).includes(value);
}

function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value);
}

export function isSupportedOpenAIModel(value: unknown): value is string {
  return typeof value === "string" && (SUPPORTED_OPENAI_MODELS as readonly string[]).includes(value);
}

function platformDefaultModel() {
  return isSupportedOpenAIModel(process.env.OPENAI_MODEL)
    ? process.env.OPENAI_MODEL
    : DEFAULT_OPENAI_DRAFT_MODEL;
}

function safeErrorMessage(message: string) {
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-...redacted").slice(0, 500);
}

function toSafeSettings(
  settings: AISettingsRow | null,
  credential: AICredentialRow | null
): SafeOrgAISettings {
  const aiMode = settings?.ai_mode ?? "work_hat_managed";
  const defaultModel = settings?.default_model ?? platformDefaultModel();
  const platformManagedAvailable = Boolean(process.env.OPENAI_API_KEY);
  const status = settings?.status ??
    (aiMode === "work_hat_managed" && platformManagedAvailable ? "active" : "not_configured");

  return {
    aiMode,
    defaultProvider: "openai",
    defaultModel,
    status,
    lastValidatedAt: settings?.last_validated_at ?? null,
    lastErrorCode: settings?.last_error_code ?? null,
    lastErrorMessage: settings?.last_error_message ?? null,
    platformManagedAvailable,
    supportedProviders: [{ provider: "openai", label: "OpenAI", supported: true }],
    supportedModels: [...SUPPORTED_OPENAI_MODELS],
    credential: credential
      ? {
          provider: "openai",
          keyHint: credential.key_hint,
          status: credential.status,
          lastValidatedAt: credential.last_validated_at,
          lastErrorCode: credential.last_error_code,
          lastErrorMessage: credential.last_error_message,
        }
      : null,
  };
}

async function getSettingsRow(db: Db, orgId: string) {
  const { data, error } = await table(db, "org_ai_settings")
    .select("org_id, ai_mode, default_provider, default_model, status, last_validated_at, last_error_code, last_error_message, updated_by, created_at, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new AISettingsError(
      "ai_provider_not_configured",
      "Unable to load AI settings for this workspace.",
      500
    );
  }

  return data as AISettingsRow | null;
}

async function getCredentialRow(adminDb: Db, orgId: string) {
  const { data, error } = await table(adminDb, "org_ai_provider_credentials")
    .select("id, org_id, provider, encrypted_api_key, key_hint, status, last_validated_at, last_error_code, last_error_message, created_by, updated_by, created_at, updated_at")
    .eq("org_id", orgId)
    .eq("provider", "openai")
    .maybeSingle();

  if (error) {
    throw new AISettingsError(
      "ai_provider_not_configured",
      "Unable to load AI provider credential for this workspace.",
      500
    );
  }

  return data as AICredentialRow | null;
}

function getAdminDb() {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    throw new AISettingsError(
      "ai_provider_not_configured",
      "AI provider settings are temporarily unavailable.",
      503,
      "Ask an administrator to verify server database configuration."
    );
  }
  return adminState.client as unknown as Db;
}

export async function getSafeOrgAISettings(db: Db, orgId: string): Promise<SafeOrgAISettings> {
  const settings = await getSettingsRow(db, orgId);
  let credential: AICredentialRow | null = null;

  try {
    credential = await getCredentialRow(getAdminDb(), orgId);
  } catch {
    credential = null;
  }

  return toSafeSettings(settings, credential);
}

export async function resolveOrgAIConfig(db: Db, orgId: string): Promise<ResolvedAIConfig> {
  const settings = await getSettingsRow(db, orgId);
  const aiMode = settings?.ai_mode ?? "work_hat_managed";
  const model = settings?.default_model ?? platformDefaultModel();

  if (aiMode === "disabled") {
    throw new AISettingsError(
      "ai_disabled",
      "AI drafting is disabled for this workspace.",
      403
    );
  }

  if (!isSupportedOpenAIModel(model)) {
    throw new AISettingsError(
      "ai_model_unavailable",
      "The selected OpenAI model is not available in Work Hat.",
      422,
      "Choose a supported OpenAI model in Settings -> AI."
    );
  }

  if (aiMode === "work_hat_managed") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AISettingsError(
        "ai_provider_not_configured",
        "Work Hat-managed AI is not configured yet.",
        503,
        "Ask your Work Hat administrator to configure the platform OpenAI key."
      );
    }
    return { aiMode, provider: "openai", model, apiKey, source: "platform", keyHint: null };
  }

  const credential = await getCredentialRow(getAdminDb(), orgId);
  if (!credential || credential.status === "disabled") {
    throw new AISettingsError(
      "ai_provider_not_configured",
      "No active customer-managed OpenAI key is configured for this workspace.",
      400,
      "Add an OpenAI API key in Settings -> AI or switch to Work Hat-managed AI."
    );
  }

  try {
    return {
      aiMode,
      provider: "openai",
      model,
      apiKey: decryptAIProviderKey(credential.encrypted_api_key),
      source: "byo",
      keyHint: credential.key_hint,
    };
  } catch {
    throw new AISettingsError(
      "ai_provider_not_configured",
      "The saved OpenAI key cannot be decrypted.",
      500,
      "Save a new OpenAI API key in Settings -> AI."
    );
  }
}

export async function validateOpenAIKey({
  apiKey,
  model,
}: {
  apiKey: string;
  model: string;
}) {
  if (!apiKey.trim()) {
    throw new AISettingsError("ai_provider_invalid_key", "Enter an OpenAI API key before testing.", 422);
  }
  if (!isSupportedOpenAIModel(model)) {
    throw new AISettingsError("ai_model_unavailable", "The selected OpenAI model is not available in Work Hat.", 422);
  }

  let response: Response;
  try {
    response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch {
    throw new AISettingsError(
      "ai_provider_timeout",
      "Work Hat could not reach OpenAI to test the key.",
      504,
      "Try again in a moment."
    );
  }

  if (response.ok) return { ok: true };

  const text = await response.text().catch(() => "");
  const lowered = text.toLowerCase();
  if (response.status === 401 || lowered.includes("invalid api key")) {
    throw new AISettingsError("ai_provider_invalid_key", "OpenAI rejected this API key.", 401);
  }
  if (response.status === 404) {
    throw new AISettingsError("ai_model_unavailable", "The selected OpenAI model is not available for this key.", 422);
  }
  if (response.status === 429 || lowered.includes("quota")) {
    throw new AISettingsError("ai_provider_quota_exceeded", "OpenAI reported that this key has no available quota.", 402);
  }

  throw new AISettingsError(
    "ai_provider_validation_failed",
    "OpenAI key validation failed.",
    502,
    safeErrorMessage(text) || undefined
  );
}

export async function saveOrgAISettings({
  db,
  orgId,
  userId,
  aiMode,
  defaultProvider,
  defaultModel,
  apiKey,
}: {
  db: Db;
  orgId: string;
  userId: string;
  aiMode: unknown;
  defaultProvider: unknown;
  defaultModel: unknown;
  apiKey?: unknown;
}) {
  if (!isAIMode(aiMode)) {
    throw new AISettingsError("ai_provider_not_configured", "Choose a valid AI mode.", 422);
  }
  if (!isAIProvider(defaultProvider)) {
    throw new AISettingsError("ai_model_unavailable", "OpenAI is the only supported AI provider in Work Hat V1.", 422);
  }
  if (!isSupportedOpenAIModel(defaultModel)) {
    throw new AISettingsError("ai_model_unavailable", "Choose a supported OpenAI model.", 422);
  }

  const adminDb = getAdminDb();
  let status: AISettingStatus = "active";
  let lastValidatedAt: string | null = null;
  let lastErrorCode: string | null = null;
  let lastErrorMessage: string | null = null;

  if (aiMode === "disabled") {
    status = "disabled";
  } else if (aiMode === "work_hat_managed") {
    status = process.env.OPENAI_API_KEY ? "active" : "not_configured";
    if (!process.env.OPENAI_API_KEY) {
      lastErrorCode = "ai_provider_not_configured";
      lastErrorMessage = "Work Hat-managed AI is not configured yet.";
    }
  } else {
    const trimmedKey = typeof apiKey === "string" ? apiKey.trim() : "";
    const existing = await getCredentialRow(adminDb, orgId);
    if (trimmedKey) {
      await validateOpenAIKey({ apiKey: trimmedKey, model: defaultModel });
      lastValidatedAt = new Date().toISOString();
      await table(adminDb, "org_ai_provider_credentials")
        .upsert({
          org_id: orgId,
          provider: "openai",
          encrypted_api_key: encryptAIProviderKey(trimmedKey),
          key_hint: keyHint(trimmedKey),
          status: "active",
          last_validated_at: lastValidatedAt,
          last_error_code: null,
          last_error_message: null,
          created_by: existing?.created_by ?? userId,
          updated_by: userId,
        }, { onConflict: "org_id,provider" })
        .select("id")
        .single();
    } else if (!existing || existing.status !== "active") {
      status = "not_configured";
      lastErrorCode = "ai_provider_not_configured";
      lastErrorMessage = "Add an OpenAI API key before enabling customer-managed AI.";
    } else {
      lastValidatedAt = existing.last_validated_at;
      lastErrorCode = existing.last_error_code;
      lastErrorMessage = existing.last_error_message;
      status = "active";
    }
  }

  const { error } = await table(db, "org_ai_settings")
    .upsert({
      org_id: orgId,
      ai_mode: aiMode,
      default_provider: "openai",
      default_model: defaultModel,
      status,
      last_validated_at: lastValidatedAt,
      last_error_code: lastErrorCode,
      last_error_message: lastErrorMessage,
      updated_by: userId,
    }, { onConflict: "org_id" })
    .select("org_id")
    .single();

  if (error) {
    throw new AISettingsError("ai_provider_not_configured", "Unable to save AI settings.", 500);
  }

  return getSafeOrgAISettings(db, orgId);
}

export async function revokeOrgAIProviderCredential({
  db,
  orgId,
  userId,
}: {
  db: Db;
  orgId: string;
  userId: string;
}) {
  const adminDb = getAdminDb();
  await table(adminDb, "org_ai_provider_credentials")
    .update({
      status: "disabled",
      updated_by: userId,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("org_id", orgId)
    .eq("provider", "openai");

  await table(db, "org_ai_settings")
    .upsert({
      org_id: orgId,
      ai_mode: "work_hat_managed",
      default_provider: "openai",
      default_model: platformDefaultModel(),
      status: process.env.OPENAI_API_KEY ? "active" : "not_configured",
      updated_by: userId,
    }, { onConflict: "org_id" })
    .select("org_id")
    .single();

  return getSafeOrgAISettings(db, orgId);
}

export function mapAISettingsError(error: unknown) {
  if (error instanceof AISettingsError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        error: error.message,
        ...(error.hint ? { hint: error.hint } : {}),
      },
    };
  }

  return {
    status: 500,
    body: {
      code: "ai_settings_failed",
      error: "AI settings are temporarily unavailable.",
    },
  };
}
