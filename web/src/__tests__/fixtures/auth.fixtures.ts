/**
 * Auth test fixtures and factories
 * Provides mock users, organizations, and capability scenarios for testing
 */

import type { CurrentAppUser } from "@/lib/auth/app-user";

export const TEST_ORG_ID = "test-org-001";
export const TEST_USER_ID = "test-user-001";
export const TEST_AUTH_USER_ID = "test-auth-user-001";

/**
 * Factory: Create a mock CurrentAppUser for testing
 */
export function createMockAppUser(overrides?: Partial<CurrentAppUser>): CurrentAppUser {
  return {
    id: TEST_USER_ID,
    auth_user_id: TEST_AUTH_USER_ID,
    org_id: TEST_ORG_ID,
    role: "agent",
    email: "test@example.com",
    full_name: "Test User",
    ...overrides,
  };
}

/**
 * Scenario: Admin user with all permissions
 */
export function createAdminUser(overrides?: Partial<CurrentAppUser>): CurrentAppUser {
  return createMockAppUser({
    role: "admin",
    email: "admin@example.com",
    full_name: "Admin User",
    ...overrides,
  });
}

/**
 * Scenario: Manager with reduced permissions
 */
export function createManagerUser(overrides?: Partial<CurrentAppUser>): CurrentAppUser {
  return createMockAppUser({
    role: "manager",
    email: "manager@example.com",
    full_name: "Manager User",
    ...overrides,
  });
}

/**
 * Scenario: Agent with minimal permissions
 */
export function createAgentUser(overrides?: Partial<CurrentAppUser>): CurrentAppUser {
  return createMockAppUser({
    role: "agent",
    email: "agent@example.com",
    full_name: "Agent User",
    ...overrides,
  });
}

/**
 * Scenario: QA reviewer role
 */
export function createQAReviewerUser(overrides?: Partial<CurrentAppUser>): CurrentAppUser {
  return createMockAppUser({
    role: "qa_reviewer",
    email: "qa@example.com",
    full_name: "QA Reviewer",
    ...overrides,
  });
}

/**
 * Scenario: User from a different org (for isolation testing)
 */
export function createUserFromDifferentOrg(overrides?: Partial<CurrentAppUser>): CurrentAppUser {
  return createMockAppUser({
    org_id: "different-org-123",
    id: "different-user-456",
    ...overrides,
  });
}

/**
 * Capability override scenarios
 */
export const CAPABILITY_OVERRIDE_SCENARIOS = {
  grantAgent: {
    user: "agent",
    overrides: [{ capability: "ai.configure" as const, effect: "grant" as const }],
    expectedCapabilities: [
      "conversations.read",
      "conversations.reply",
      "ai.generate",
      "knowledge.read",
      "ai.configure", // granted override
    ],
  },
  revokeManager: {
    user: "manager",
    overrides: [{ capability: "billing.manage" as const, effect: "revoke" as const }],
    expectedCapabilities: [
      "conversations.read",
      "conversations.reply",
      "conversations.assign",
      "records.manage",
      "ai.generate",
      "ai.configure",
      "knowledge.read",
      "knowledge.edit",
      "qa.review",
      "integrations.manage",
      "team.invite",
      "team.skills.manage",
      "audit.read",
      // billing.manage revoked
    ],
  },
  conflictingOverrides: {
    user: "agent",
    overrides: [
      { capability: "ai.configure" as const, effect: "grant" as const },
      { capability: "ai.configure" as const, effect: "revoke" as const },
    ],
    // Last override wins (revoke)
    expectedCapabilities: [
      "conversations.read",
      "conversations.reply",
      "ai.generate",
      "knowledge.read",
    ],
  },
};

/**
 * Mock database response objects
 */
export const mockRoleCapabilitiesResponse = (role: string) => {
  const capabilities = {
    admin: [
      "conversations.read",
      "conversations.reply",
      "conversations.assign",
      "records.manage",
      "ai.generate",
      "ai.configure",
      "knowledge.read",
      "knowledge.edit",
      "qa.review",
      "settings.manage",
      "billing.manage",
      "integrations.manage",
      "team.manage",
      "team.invite",
      "team.skills.manage",
      "audit.read",
    ],
    manager: [
      "conversations.read",
      "conversations.reply",
      "conversations.assign",
      "records.manage",
      "ai.generate",
      "ai.configure",
      "knowledge.read",
      "knowledge.edit",
      "qa.review",
      "billing.manage",
      "integrations.manage",
      "team.invite",
      "team.skills.manage",
      "audit.read",
    ],
    agent: [
      "conversations.read",
      "conversations.reply",
      "ai.generate",
      "knowledge.read",
    ],
    qa_reviewer: ["conversations.read", "knowledge.read", "qa.review"],
  };

  return (capabilities[role as keyof typeof capabilities] || []).map((capability) => ({
    capability,
    role,
  }));
};

/**
 * Error scenarios for testing
 */
export const AUTH_ERROR_SCENARIOS = {
  missingUser: {
    name: "Missing auth user",
    condition: () => null, // Represents failed getCurrentAppUser()
    expectedStatus: 401,
  },
  insufficientPermission: {
    name: "Insufficient capability",
    user: createAgentUser(),
    capability: "billing.manage" as const,
    expectedStatus: 403,
  },
  orgIsolationBreach: {
    name: "User accessing different org's data",
    user: createAgentUser(),
    attemptedOrgId: "malicious-org-id",
    expectedStatus: 403,
  },
};
