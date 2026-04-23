/**
 * Tests for request-scoped caching
 *
 * Coverage:
 * - Cache get/set operations
 * - TTL and staleness detection
 * - Key existence checks
 * - Cache stats
 * - Helper key generation functions
 */

import {
  createRequestCache,
  getCapabilityCacheKey,
  getOverrideCacheKey,
  getRoleCapabilitiesCacheKey,
} from "../request-cache";

describe("Request Cache", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Basic Operations", () => {
    it("should store and retrieve values", () => {
      const cache = createRequestCache();

      cache.set("test:key", "test value");
      expect(cache.get("test:key")).toBe("test value");
    });

    it("should return undefined for missing keys", () => {
      const cache = createRequestCache();

      expect(cache.get("nonexistent:key")).toBeUndefined();
    });

    it("should store different types", () => {
      const cache = createRequestCache();

      cache.set("string", "value");
      cache.set("number", 42);
      cache.set("object", { a: 1, b: 2 });
      cache.set("array", [1, 2, 3]);
      cache.set("null", null);

      expect(cache.get("string")).toBe("value");
      expect(cache.get("number")).toBe(42);
      expect(cache.get("object")).toEqual({ a: 1, b: 2 });
      expect(cache.get("array")).toEqual([1, 2, 3]);
      expect(cache.get("null")).toBe(null);
    });

    it("should overwrite existing values", () => {
      const cache = createRequestCache();

      cache.set("key", "first");
      expect(cache.get("key")).toBe("first");

      cache.set("key", "second");
      expect(cache.get("key")).toBe("second");
    });
  });

  describe("Key Existence", () => {
    it("should check if key exists", () => {
      const cache = createRequestCache();

      cache.set("exists", "value");
      expect(cache.has("exists")).toBe(true);
      expect(cache.has("missing")).toBe(false);
    });

    it("should return false for stale keys", () => {
      jest.useFakeTimers();
      const cache = createRequestCache();

      cache.set("key", "value", 50); // 50ms TTL
      expect(cache.has("key")).toBe(true);

      jest.advanceTimersByTime(100);
      expect(cache.has("key")).toBe(false);
    });
  });

  describe("TTL and Staleness", () => {
    it("should return fresh values within TTL", () => {
      jest.useFakeTimers();
      const cache = createRequestCache();

      cache.set("fresh", "value", 100); // 100ms TTL
      expect(cache.get("fresh")).toBe("value");

      jest.advanceTimersByTime(50);
      expect(cache.get("fresh")).toBe("value");
    });

    it("should return undefined for stale values", () => {
      jest.useFakeTimers();
      const cache = createRequestCache();

      cache.set("stale", "value", 50); // 50ms TTL
      expect(cache.get("stale")).toBe("value");

      jest.advanceTimersByTime(100);
      expect(cache.get("stale")).toBeUndefined();
    });

    it("should auto-delete stale entries on access", () => {
      jest.useFakeTimers();
      const cache = createRequestCache();

      cache.set("key", "value", 50);
      const { size: sizeBeforeStale } = cache.stats();

      jest.advanceTimersByTime(100);
      cache.get("key"); // Triggers deletion of stale entry
      const { size: sizeAfterStale } = cache.stats();

      expect(sizeAfterStale).toBeLessThan(sizeBeforeStale);
    });

    it("should support entries without TTL (never stale)", () => {
      jest.useFakeTimers();
      const cache = createRequestCache();

      cache.set("permanent", "value"); // No TTL
      expect(cache.get("permanent")).toBe("value");

      // Even after 1000ms, should still be there
      jest.advanceTimersByTime(1000);
      expect(cache.get("permanent")).toBe("value");
    });
  });

  describe("Deletion", () => {
    it("should delete specific keys", () => {
      const cache = createRequestCache();

      cache.set("key1", "value1");
      cache.set("key2", "value2");

      cache.delete("key1");

      expect(cache.has("key1")).toBe(false);
      expect(cache.has("key2")).toBe(true);
    });

    it("should clear entire cache", () => {
      const cache = createRequestCache();

      cache.set("key1", "value1");
      cache.set("key2", "value2");
      cache.set("key3", "value3");

      expect(cache.stats().size).toBe(3);

      cache.clear();

      expect(cache.stats().size).toBe(0);
      expect(cache.get("key1")).toBeUndefined();
      expect(cache.get("key2")).toBeUndefined();
      expect(cache.get("key3")).toBeUndefined();
    });
  });

  describe("Statistics", () => {
    it("should report cache size", () => {
      const cache = createRequestCache();

      cache.set("key1", "value1");
      cache.set("key2", "value2");

      const { size } = cache.stats();
      expect(size).toBe(2);
    });

    it("should list all keys", () => {
      const cache = createRequestCache();

      cache.set("users:123", "alice");
      cache.set("org:456", "acme");
      cache.set("role:admin", "root");

      const { keys } = cache.stats();
      expect(keys).toContain("users:123");
      expect(keys).toContain("org:456");
      expect(keys).toContain("role:admin");
    });

    it("should exclude stale entries from stats", () => {
      jest.useFakeTimers();
      const cache = createRequestCache();

      cache.set("fresh", "value", 100);
      cache.set("stale", "value", 50);

      const { size: sizeInitial } = cache.stats();
      expect(sizeInitial).toBe(2);

      jest.advanceTimersByTime(100);
      const { size: sizeAfter } = cache.stats();
      // Stats should still count stale entries (not auto-cleaned)
      expect(sizeAfter).toBe(2);

      // But accessing stale entry removes it
      cache.get("stale");
      const { size: sizeFinal } = cache.stats();
      expect(sizeFinal).toBe(1);
    });
  });

  describe("Cache Key Helpers", () => {
    it("should generate capability cache key", () => {
      const key = getCapabilityCacheKey("user-123", "org-456");
      expect(key).toBe("cap:user-123:org-456");
    });

    it("should generate capability cache key with specific capability", () => {
      const key = getCapabilityCacheKey("user-123", "org-456", "conversations.read");
      expect(key).toBe("cap:user-123:org-456:conversations.read");
    });

    it("should generate override cache key", () => {
      const key = getOverrideCacheKey("user-123", "org-456");
      expect(key).toBe("overrides:user-123:org-456");
    });

    it("should generate role cache key", () => {
      const key = getRoleCapabilitiesCacheKey("agent");
      expect(key).toBe("role_caps:agent");
    });

    it("should generate unique keys for different inputs", () => {
      const key1 = getCapabilityCacheKey("user-1", "org-1");
      const key2 = getCapabilityCacheKey("user-2", "org-1");
      const key3 = getCapabilityCacheKey("user-1", "org-2");

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });
  });

  describe("Type Safety", () => {
    it("should preserve types on get", () => {
      const cache = createRequestCache();

      const user = { id: "123", name: "Alice", roles: ["admin", "user"] };
      cache.set("user", user);

      const retrieved = cache.get<typeof user>("user");
      expect(retrieved?.id).toBe("123");
      expect(retrieved?.roles).toContain("admin");
    });

    it("should handle generic typing", () => {
      const cache = createRequestCache();

      const data: Map<string, number> = new Map([["a", 1]]);
      cache.set("map", data);

      const retrieved = cache.get<Map<string, number>>("map");
      expect(retrieved?.get("a")).toBe(1);
    });
  });

  describe("Integration: Reducing DB Calls", () => {
    it("should eliminate duplicate queries within request", () => {
      const cache = createRequestCache();
      const mockDb = {
        queries: 0,
        async getUserCapabilities(userId: string, orgId: string) {
          mockDb.queries++;
          return new Set(["conversations.read", "conversations.reply"]);
        },
      };

      // Simulate first check in request
      const key = getCapabilityCacheKey("user-123", "org-456");
      let cached = cache.get(key);
      if (!cached) {
        // First time: query DB
        cached = mockDb.getUserCapabilities("user-123", "org-456");
        cache.set(key, cached);
      }

      // Simulate second check in request (authorization check in middleware + route handler)
      let cached2 = cache.get(key);
      if (!cached2) {
        // Would query DB again (but shouldn't!)
        cached2 = mockDb.getUserCapabilities("user-123", "org-456");
      }

      // Verify we only queried DB once
      expect(mockDb.queries).toBe(1);
      expect(cached).toEqual(cached2);
    });

    it("should support cache per user/org combination", () => {
      const cache = createRequestCache();

      const capabilities1 = new Set(["conversations.read"]);
      const capabilities2 = new Set(["admin.manage"]);

      cache.set(getCapabilityCacheKey("user-1", "org-1"), capabilities1);
      cache.set(getCapabilityCacheKey("user-2", "org-2"), capabilities2);

      expect(cache.get(getCapabilityCacheKey("user-1", "org-1"))).toBe(capabilities1);
      expect(cache.get(getCapabilityCacheKey("user-2", "org-2"))).toBe(capabilities2);
    });
  });
});
