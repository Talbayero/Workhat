/**
 * Tests for lib/auth/capabilities.ts
 */

import { CAPABILITIES, hasCapability, requireCapability } from "../capabilities";
import {
  createAdminUser,
  createAgentUser,
  createManagerUser,
  TEST_ORG_ID,
  TEST_USER_ID,
} from "@/__tests__/fixtures/auth.fixtures";

jest.mock("@/lib/supabase/admin", () => ({
  createOptionalAdminClient: jest.fn(),
}));

jest.mock("@/lib/security/audit-logger", () => ({
  logAudit: jest.fn(async () => undefined),
}));

import { createOptionalAdminClient } from "@/lib/supabase/admin";

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

type MockQuery = {
  select: jest.Mock<MockQuery, []>;
  eq: jest.Mock<MockQuery, [string, string]>;
  then: (
    resolve: (value: QueryResponse) => unknown,
    reject: (reason?: unknown) => unknown
  ) => Promise<unknown>;
};

function createQuery(response: QueryResponse, onEq?: (column: string, value: string) => void) {
  const query: MockQuery = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: string) => {
      onEq?.(column, value);
      return query;
    }),
    then: (
      resolve: (value: QueryResponse) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(response).then(resolve, reject),
  };

  return query;
}

function mockAdminClient({
  roleRows,
  overrideRows = [],
  roleError = null,
  onEq,
}: {
  roleRows: unknown[];
  overrideRows?: unknown[];
  roleError?: { message: string } | null;
  onEq?: (column: string, value: string) => void;
}) {
  return {
    from: jest.fn((table: string) => {
      if (table === "role_capabilities") {
        return createQuery({ data: roleRows, error: roleError }, onEq);
      }
      if (table === "user_capability_overrides") {
        return createQuery({ data: overrideRows, error: null }, onEq);
      }
      return createQuery({ data: [], error: null }, onEq);
    }),
  };
}

function availableAdminState(options: Parameters<typeof mockAdminClient>[0]) {
  return {
    client: mockAdminClient(options) as never,
    reason: "service_role_key_valid" as const,
    keyRole: "service_role" as const,
  };
}

describe("Capabilities System", () => {
  const mockCreateOptionalAdminClient = createOptionalAdminClient as jest.MockedFunction<
    typeof createOptionalAdminClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns true for admin with mapped capabilities", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: CAPABILITIES.map((capability) => ({ capability })),
      })
    );

    await expect(hasCapability(createAdminUser(), "billing.manage")).resolves.toBe(true);
  });

  it("returns false when the mapped role lacks a capability", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [
          { capability: "conversations.read" },
          { capability: "conversations.reply" },
          { capability: "ai.generate" },
          { capability: "knowledge.read" },
        ],
      })
    );

    await expect(hasCapability(createAgentUser(), "billing.manage")).resolves.toBe(false);
  });

  it("applies grant overrides", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [{ capability: "conversations.read" }],
        overrideRows: [{ capability: "billing.manage", effect: "grant" }],
      })
    );

    await expect(hasCapability(createAgentUser(), "billing.manage")).resolves.toBe(true);
  });

  it("applies revoke overrides", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [
          { capability: "conversations.read" },
          { capability: "billing.manage" },
          { capability: "team.manage" },
        ],
        overrideRows: [{ capability: "billing.manage", effect: "revoke" }],
      })
    );

    await expect(hasCapability(createManagerUser(), "billing.manage")).resolves.toBe(false);
  });

  it("falls back to role presets when admin client is unavailable", async () => {
    mockCreateOptionalAdminClient.mockReturnValue({
      client: null,
      reason: "missing_env",
    });

    await expect(hasCapability(createAgentUser(), "conversations.read")).resolves.toBe(true);
    await expect(hasCapability(createAgentUser(), "billing.manage")).resolves.toBe(false);
  });

  it("falls back to role presets when role capability lookup fails", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [],
        roleError: { message: "Connection refused" },
      })
    );

    await expect(hasCapability(createAgentUser(), "conversations.read")).resolves.toBe(true);
  });

  it("filters override lookups by org_id and user_id", async () => {
    const eqSpy = jest.fn();

    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [{ capability: "conversations.read" }],
        onEq: eqSpy,
      })
    );

    await hasCapability(createAgentUser({ org_id: TEST_ORG_ID }), "billing.manage");

    expect(eqSpy).toHaveBeenCalledWith("role", "agent");
    expect(eqSpy).toHaveBeenCalledWith("org_id", TEST_ORG_ID);
    expect(eqSpy).toHaveBeenCalledWith("user_id", TEST_USER_ID);
  });

  it("returns null from requireCapability when allowed", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: CAPABILITIES.map((capability) => ({ capability })),
      })
    );

    await expect(requireCapability(createAdminUser(), "billing.manage")).resolves.toBeNull();
  });

  it("returns 403 from requireCapability when denied", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [{ capability: "conversations.read" }],
      })
    );

    const response = await requireCapability(createAgentUser(), "billing.manage");
    expect(response?.status).toBe(403);
  });

  it("ignores invalid capability strings in overrides", async () => {
    mockCreateOptionalAdminClient.mockReturnValue(
      availableAdminState({
        roleRows: [{ capability: "conversations.read" }],
        overrideRows: [
          { capability: "invalid.capability", effect: "grant" },
          { capability: "billing.manage", effect: "grant" },
        ],
      })
    );

    await expect(hasCapability(createAgentUser(), "billing.manage")).resolves.toBe(true);
  });
});
