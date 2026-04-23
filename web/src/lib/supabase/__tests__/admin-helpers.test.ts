/**
 * Tests for admin client helper functions
 *
 * Coverage:
 * - getAdminClientOrThrow: throws when client unavailable
 * - getAdminClientOrLogError: returns null and logs error
 * - getAdminClientOrLogWarn: returns null and logs warning
 * - getAdminClientOrHandle: calls custom handler
 * - isAdminClientAvailable: returns boolean without logging
 */

import {
  getAdminClientOrThrow,
  getAdminClientOrLogError,
  getAdminClientOrLogWarn,
  getAdminClientOrHandle,
  isAdminClientAvailable,
} from "../admin-helpers";
import * as adminModule from "../admin";

// Mock the admin module
jest.mock("../admin");

const mockCreateOptionalAdminClient = adminModule.createOptionalAdminClient as jest.MockedFunction<any>;

describe("Admin Client Helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getAdminClientOrThrow", () => {
    it("should return client when available", () => {
      const mockClient = { from: jest.fn() };
      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: "service_role_key_valid",
        keyRole: "service_role",
      });

      const client = getAdminClientOrThrow("test");
      expect(client).toBe(mockClient);
    });

    it("should throw when client is unavailable", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      expect(() => getAdminClientOrThrow("test-label")).toThrow(
        "[test-label] Admin client unavailable: missing_env"
      );
    });

    it("should include reason in error message", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "invalid_service_role_key",
        keyRole: "anon",
      });

      expect(() => getAdminClientOrThrow("capability-check")).toThrow(
        "invalid_service_role_key"
      );
    });
  });

  describe("getAdminClientOrLogError", () => {
    it("should return client when available without logging", () => {
      const mockClient = { from: jest.fn() };
      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: "service_role_key_valid",
        keyRole: "service_role",
      });

      const client = getAdminClientOrLogError("test");
      expect(client).toBe(mockClient);
      expect(console.error).not.toHaveBeenCalled();
    });

    it("should return null and log error when client unavailable", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      const client = getAdminClientOrLogError("audit-lookup");
      expect(client).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        "[audit-lookup] Admin client unavailable: missing_env"
      );
    });

    it("should log with provided label", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "client_init_failed",
        keyRole: "service_role",
      });

      getAdminClientOrLogError("custom-label");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[custom-label]")
      );
    });
  });

  describe("getAdminClientOrLogWarn", () => {
    it("should return client when available without logging", () => {
      const mockClient = { from: jest.fn() };
      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: "service_role_key_valid",
        keyRole: "service_role",
      });

      const client = getAdminClientOrLogWarn("test");
      expect(client).toBe(mockClient);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should return null and log warning when client unavailable", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      const client = getAdminClientOrLogWarn("capability-overrides");
      expect(client).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        "[capability-overrides] Admin client unavailable: missing_env"
      );
    });

    it("should use warn level, not error", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "invalid_service_role_key",
        keyRole: "anon",
      });

      getAdminClientOrLogWarn("test");
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("getAdminClientOrHandle", () => {
    it("should return client and not call handler when available", () => {
      const mockClient = { from: jest.fn() };
      const mockHandler = jest.fn();
      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: "service_role_key_valid",
        keyRole: "service_role",
      });

      const client = getAdminClientOrHandle("test", mockHandler);
      expect(client).toBe(mockClient);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("should call handler with state when client unavailable", () => {
      const mockHandler = jest.fn();
      const errorState = {
        client: null,
        reason: "missing_env" as const,
      };
      mockCreateOptionalAdminClient.mockReturnValue(errorState);

      const client = getAdminClientOrHandle("test", mockHandler);
      expect(client).toBeNull();
      expect(mockHandler).toHaveBeenCalledWith(errorState);
    });

    it("should pass full state including keyRole to handler", () => {
      const mockHandler = jest.fn();
      const errorState = {
        client: null,
        reason: "invalid_service_role_key" as const,
        keyRole: "anon" as const,
      };
      mockCreateOptionalAdminClient.mockReturnValue(errorState);

      getAdminClientOrHandle("test", mockHandler);
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "invalid_service_role_key",
          keyRole: "anon",
        })
      );
    });

    it("should allow custom error handling logic", () => {
      const trackingFn = jest.fn();
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      getAdminClientOrHandle("test", (state) => {
        if (state.reason === "missing_env") {
          trackingFn("config_error");
        } else {
          trackingFn("auth_error");
        }
      });

      expect(trackingFn).toHaveBeenCalledWith("config_error");
    });
  });

  describe("isAdminClientAvailable", () => {
    it("should return true when client is available", () => {
      const mockClient = { from: jest.fn() };
      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: "service_role_key_valid",
        keyRole: "service_role",
      });

      expect(isAdminClientAvailable()).toBe(true);
      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should return false when client is unavailable", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      expect(isAdminClientAvailable()).toBe(false);
    });

    it("should not log anything", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      isAdminClientAvailable();
      expect(console.error).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("should check availability without side effects", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "invalid_service_role_key",
        keyRole: "anon",
      });

      const available1 = isAdminClientAvailable();
      const available2 = isAdminClientAvailable();

      expect(available1).toBe(false);
      expect(available2).toBe(false);
      expect(mockCreateOptionalAdminClient).toHaveBeenCalledTimes(2);
    });
  });

  describe("Integration: Reducing boilerplate", () => {
    it("should eliminate null checks with getAdminClientOrThrow", () => {
      const mockClient = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue("query"),
        }),
      };
      mockCreateOptionalAdminClient.mockReturnValue({
        client: mockClient,
        reason: "service_role_key_valid",
        keyRole: "service_role",
      });

      // Old pattern (3 lines):
      // const { client, reason } = createOptionalAdminClient();
      // if (!client) throw new Error(`Client unavailable: ${reason}`);
      // const query = client.from("users").select("*");

      // New pattern (1 line):
      const client = getAdminClientOrThrow("user-lookup");
      const query = client.from("users").select("*");

      expect(query).toBe("query");
      expect(mockClient.from).toHaveBeenCalledWith("users");
    });

    it("should eliminate null checks with getAdminClientOrLogWarn", () => {
      mockCreateOptionalAdminClient.mockReturnValue({
        client: null,
        reason: "missing_env",
      });

      // Old pattern (5 lines):
      // const { client, reason } = createOptionalAdminClient();
      // if (!client) {
      //   console.warn(`[label] capability DB lookup unavailable: ${reason}`);
      //   return presetCapabilitiesForRole(user.role);
      // }

      // New pattern (2-3 lines):
      const client = getAdminClientOrLogWarn("capability-check");
      if (!client) {
        expect(client).toBeNull();
        expect(console.warn).toHaveBeenCalled();
        return;
      }
    });
  });
});
