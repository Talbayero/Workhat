jest.mock("@/lib/supabase/admin", () => ({
  createOptionalAdminClient: jest.fn(),
}));

import { createOptionalAdminClient } from "@/lib/supabase/admin";
import {
  AISettingsError,
  getSafeOrgAISettings,
  resolveOrgAIConfig,
  saveOrgAISettings,
  validateOpenAIKey,
} from "@/lib/ai-settings";
import { encryptAIProviderKey } from "@/lib/ai-settings/encryption";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

class Query {
  private filters: Filter[] = [];
  private upsertValue: Row | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string
  ) {}

  select() {
    return this;
  }

  upsert(value: Row) {
    this.upsertValue = value;
    const rows = this.db.rows[this.table] ??= [];
    const conflict = this.table === "org_ai_settings"
      ? (row: Row) => row.org_id === value.org_id
      : (row: Row) => row.org_id === value.org_id && row.provider === value.provider;
    const existing = rows.find(conflict);
    if (existing) Object.assign(existing, value);
    else rows.push({
      id: value.id ?? `${this.table}-${rows.length + 1}`,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      ...value,
    });
    return this;
  }

  update(value: Row) {
    for (const row of this.matchingRows()) Object.assign(row, value);
    return this;
  }

  delete() {
    this.db.rows[this.table] = (this.db.rows[this.table] ?? []).filter((row) =>
      !this.filters.every((filter) => filter(row))
    );
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  private matchingRows() {
    return (this.db.rows[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => filter(row))
    );
  }

  async maybeSingle() {
    return { data: this.matchingRows()[0] ?? null, error: null };
  }

  async single() {
    return { data: this.upsertValue ?? this.matchingRows()[0] ?? { id: `${this.table}-1` }, error: null };
  }
}

class FakeDb {
  rows: Record<string, Row[]> = {
    org_ai_settings: [],
    org_ai_provider_credentials: [],
  };

  from(table: string) {
    return new Query(this, table);
  }
}

const originalOpenAIKey = process.env.OPENAI_API_KEY;
const originalOpenAIModel = process.env.OPENAI_MODEL;
const originalAIEncryptionKey = process.env.AI_PROVIDER_KEY_ENCRYPTION_KEY;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = "platform-openai-key";
  process.env.OPENAI_MODEL = "gpt-4o";
  process.env.AI_PROVIDER_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterEach(() => {
  process.env.OPENAI_API_KEY = originalOpenAIKey;
  process.env.OPENAI_MODEL = originalOpenAIModel;
  process.env.AI_PROVIDER_KEY_ENCRYPTION_KEY = originalAIEncryptionKey;
  jest.restoreAllMocks();
});

describe("AI settings service", () => {
  it("defaults to Work Hat-managed OpenAI when no org setting exists", async () => {
    const userDb = new FakeDb();
    const adminDb = new FakeDb();
    jest.mocked(createOptionalAdminClient).mockReturnValue({ client: adminDb, reason: "service_role_key_valid", keyRole: "service_role" } as never);

    await expect(resolveOrgAIConfig(userDb, "org-1")).resolves.toEqual(expect.objectContaining({
      aiMode: "work_hat_managed",
      provider: "openai",
      model: "gpt-4o",
      apiKey: "platform-openai-key",
      source: "platform",
    }));
  });

  it("uses the decrypted org OpenAI key in BYOK mode", async () => {
    const userDb = new FakeDb();
    userDb.rows.org_ai_settings.push({
      org_id: "org-1",
      ai_mode: "byo",
      default_provider: "openai",
      default_model: "gpt-4o-mini",
      status: "active",
      last_validated_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_by: "user-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const adminDb = new FakeDb();
    adminDb.rows.org_ai_provider_credentials.push({
      id: "credential-1",
      org_id: "org-1",
      provider: "openai",
      encrypted_api_key: encryptAIProviderKey("customer-openai-key"),
      key_hint: "...-key",
      status: "active",
      last_validated_at: null,
      last_error_code: null,
      last_error_message: null,
      created_by: "user-1",
      updated_by: "user-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    jest.mocked(createOptionalAdminClient).mockReturnValue({ client: adminDb, reason: "service_role_key_valid", keyRole: "service_role" } as never);

    await expect(resolveOrgAIConfig(userDb, "org-1")).resolves.toEqual(expect.objectContaining({
      aiMode: "byo",
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "customer-openai-key",
      source: "byo",
    }));
  });

  it("blocks draft generation when AI is disabled", async () => {
    const userDb = new FakeDb();
    userDb.rows.org_ai_settings.push({
      org_id: "org-1",
      ai_mode: "disabled",
      default_provider: "openai",
      default_model: "gpt-4o",
      status: "disabled",
      last_validated_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_by: "user-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    });

    await expect(resolveOrgAIConfig(userDb, "org-1")).rejects.toMatchObject({
      code: "ai_disabled",
      message: "AI drafting is disabled for this workspace.",
    });
  });

  it("rejects invalid OpenAI keys during validation", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("invalid api key", { status: 401 }));

    await expect(validateOpenAIKey({ apiKey: "sk-invalid", model: "gpt-4o" })).rejects.toMatchObject({
      code: "ai_provider_invalid_key",
    });
  });

  it("rejects unsupported providers or models before saving", async () => {
    const userDb = new FakeDb();
    const adminDb = new FakeDb();
    jest.mocked(createOptionalAdminClient).mockReturnValue({ client: adminDb, reason: "service_role_key_valid", keyRole: "service_role" } as never);

    await expect(saveOrgAISettings({
      db: userDb,
      orgId: "org-1",
      userId: "user-1",
      aiMode: "byo",
      defaultProvider: "anthropic",
      defaultModel: "claude-3",
      apiKey: "sk-valid",
    })).rejects.toBeInstanceOf(AISettingsError);

    await expect(saveOrgAISettings({
      db: userDb,
      orgId: "org-1",
      userId: "user-1",
      aiMode: "byo",
      defaultProvider: "openai",
      defaultModel: "unknown-model",
      apiKey: "sk-valid",
    })).rejects.toMatchObject({ code: "ai_model_unavailable" });
  });

  it("saves BYOK without returning plaintext or encrypted API keys", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const userDb = new FakeDb();
    const adminDb = new FakeDb();
    jest.mocked(createOptionalAdminClient).mockReturnValue({ client: adminDb, reason: "service_role_key_valid", keyRole: "service_role" } as never);

    const settings = await saveOrgAISettings({
      db: userDb,
      orgId: "org-1",
      userId: "user-1",
      aiMode: "byo",
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      apiKey: "sk-test-secret-1234",
    });

    const serialized = JSON.stringify(settings);
    expect(serialized).not.toContain("sk-test-secret-1234");
    expect(serialized).not.toContain("encrypted_api_key");
    expect(settings.credential).toEqual(expect.objectContaining({
      provider: "openai",
      keyHint: "sk-...1234",
      status: "active",
    }));

    const rawCredential = adminDb.rows.org_ai_provider_credentials[0];
    expect(rawCredential.encrypted_api_key).toEqual(expect.any(String));
    expect(rawCredential.encrypted_api_key).not.toBe("sk-test-secret-1234");

    await expect(getSafeOrgAISettings(userDb, "org-1")).resolves.toEqual(expect.objectContaining({
      aiMode: "byo",
      credential: expect.objectContaining({ keyHint: "sk-...1234" }),
    }));
  });
});
