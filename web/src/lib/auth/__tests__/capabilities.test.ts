/**
 * Tests for lib/auth/capabilities.ts
 * Coverage: Authorization, capability resolution, edge cases
 */

import { hasCapability, requireCapability, CAPABILITIES } from "../capabilities";
import type { CurrentAppUser } from "../app-user";
import {
  createAdminUser,
  createAgentUser,
  createManagerUser,
  createMockAppUser,
  TEST_ORG_ID,
  TEST_USER_ID,
} from "@/__tests__/fixtures/auth.fixtures";
import { createMockSupabaseClient } from "@/__tests__/utils/mocks";

// Mock the admin client
jest.mock("@/lib/supabase/admin", () => ({
  createOptionalAdminClient: jest.fn(),
}));

import { createOptionalAdminClient } from "@/lib/supabase/admin";

describe("Capabilities System", () => {
  const mockCreateOptionalAdminClient = createOptionalAdminClient as jest.MockedFunction<
    typeof createOptionalAdminClient
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("hasCapability()", () => {
    it("should return true for admin with all capabilities", async () => {
      const adminUser = createAdminUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      // Mock role_capabilities response
      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: CAPABILITIES.map((cap) => ({ capability: cap })),
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }) as any;

      const result = await hasCapability(adminUser, "billing.manage");
      expect(result).toBe(true);
    });

    it("should return false for agent without billing capability", async () => {
      const agentUser = createAgentUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      // Mock agent capabilities (limited set)
      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { capability: "conversations.read" },
                { capability: "conversations.reply" },
                { capability: "ai.generate" },
                { capability: "knowledge.read" },
              ],
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }) as any;

      const result = await hasCapability(agentUser, "billing.manage");
      expect(result).toBe(false);
    });

    it("should apply grant overrides", async () => {
      const agentUser = createAgentUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      // Mock: agent base capabilities + override grant
      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { capability: "conversations.read" },
                { capability: "conversations.reply" },
                { capability: "ai.generate" },
                { capability: "knowledge.read" },
              ],
              error: null,
            }),
          };
        }
        if (table === "user_capability_overrides") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ capability: "billing.manage", effect: "grant" }],
              error: null,
            }),
            eq: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
          eq: jest.fn().mockReturnThis(),
        };
      }) as any;

      const result = await hasCapability(agentUser, "billing.manage");
      expect(result).toBe(true);
    });

    it("should apply revoke overrides", async () => {
      const managerUser = createManagerUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      // Mock: manager base capabilities + revoke billing
      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { capability: "conversations.read" },
                { capability: "billing.manage" },
                { capability: "team.manage" },
              ],
              error: null,
            }),
          };
        }
        if (table === "user_capability_overrides") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ capability: "billing.manage", effect: "revoke" }],
              error: null,
            }),
            eq: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
          eq: jest.fn().mockReturnThis(),
        };
      }) as any;

      const result = await hasCapability(managerUser, "billing.manage");
      expect(result).toBe(false);
    });

    it("should handle admin client unavailability (fallback to role preset)", async () => {
      const agentUser = createAgentUser();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "Not configured",
      });

      // Should fallback to role preset: agent has conversations.read
      const canRead = await hasCapability(agentUser, "conversations.read");
      expect(canRead).toBe(true);

      // But not billing.manage
      const canBill = await hasCapability(agentUser, "billing.manage");
      expect(canBill).toBe(false);
    });

    it("should handle role_capabilities query error (fallback to preset)", async () => {
      const agentUser = createAgentUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "Connection refused" },
            }),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
        };
      }) as any;

      // Should fallback to role preset
      const result = await hasCapability(agentUser, "conversations.read");
      expect(result).toBe(true);
    });

    it("should verify org_id isolation in override queries", async () => {
      const agentUser = createAgentUser({ org_id: TEST_ORG_ID });
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      const eqSpy = jest.fn().mockReturnThis();

      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }
        if (table === "user_capability_overrides") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
            eq: eqSpy,
          };
        }
        return { eq: eqSpy };
      }) as any;

      await hasCapability(agentUser, "billing.manage");

      // Verify org_id filter was applied
      expect(eqSpy).toHaveBeenCalledWith("org_id", TEST_ORG_ID);
      expect(eqSpy).toHaveBeenCalledWith("user_id", TEST_USER_ID);
    });
  });

  describe("requireCapability()", () => {
    it("should return null when user has capability", async () => {
      const adminUser = createAdminUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      mockClient.from = jest.fn(() => ({
        select: jest.fn().mockResolvedValue({
          data: CAPABILITIES.map((cap) => ({ capability: cap })),
          error: null,
        }),
        eq: jest.fn().mockReturnThis(),
      })) as any;

      const result = await requireCapability(adminUser, "billing.manage");
      expect(result).toBeNull();
    });

    it("should return 403 when user lacks capability", async () => {
      const agentUser = createAgentUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      mockClient.from = jest.fn(() => ({
        select: jest.fn().mockResolvedValue({
          data: [
            { capability: "conversations.read" },
            { capability: "conversations.reply" },
            { capability: "ai.generate" },
            { capability: "knowledge.read" },
          ],
          error: null,
        }),
        eq: jest.fn().mockReturnThis(),
      })) as any;

      const result = await requireCapability(agentUser, "billing.manage");
      expect(result).not.toBeNull();
      expect(result?.status).toBe(403);
    });
  });

  describe("Edge Cases", () => {
    it("should ignore invalid capability strings in overrides", async () => {
      const agentUser = createAgentUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ capability: "conversations.read" }],
              error: null,
            }),
          };
        }
        if (table === "user_capability_overrides") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [
                { capability: "invalid.capability", effect: "grant" },
                { capability: "billing.manage", effect: "grant" },
              ],
              error: null,
            }),
            eq: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
          eq: jest.fn().mockReturnThis(),
        };
      }) as any;

      // Invalid capability should be ignored; only valid grant applied
      const result = await hasCapability(agentUser, "billing.manage");
      expect(result).toBe(true);
    });

    it("should handle empty override list", async () => {
      const agentUser = createAgentUser();
      const mockClient = createMockSupabaseClient();

      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: null,
      });

      mockClient.from = jest.fn((table: string) => {
        if (table === "role_capabilities") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [{ capability: "conversations.read" }],
              error: null,
            }),
          };
        }
        if (table === "user_capability_overrides") {
          return {
            select: jest.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
            eq: jest.fn().mockReturnThis(),
          };
        }
        return {
          select: jest.fn().mockResolvedValue({ data: [], error: null }),
          eq: jest.fn().mockReturnThis(),
        };
      }) as any;

      // Should use role preset; no overrides to apply
      const result = await hasCapability(agentUser, "conversations.read");
      expect(result).toBe(true);
    });
  });
});
