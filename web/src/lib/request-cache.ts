/**
 * request-cache.ts
 *
 * Request-scoped caching for expensive operations.
 *
 * Provides automatic cache storage/retrieval within a single HTTP request,
 * eliminating duplicate database queries for the same data.
 *
 * Usage:
 *   // In middleware or early request handler:
 *   const cache = createRequestCache();
 *   // Store in request.locals or pass through async context
 *
 *   // In auth/capabilities.ts:
 *   const cached = cache.get('capabilities:user-123:org-456');
 *   if (cached) return cached;
 *   const result = await fetchFromDatabase(...);
 *   cache.set('capabilities:user-123:org-456', result);
 *   return result;
 *
 * Benefits:
 * - Eliminates redundant DB queries within single request
 * - Automatic cleanup when request ends
 * - Type-safe with generic caching
 * - No external dependencies (Map-based)
 * - Optional TTL for safety (prevents stale reads)
 */

export interface CacheEntry<T = unknown> {
  value: T;
  timestamp: number;
  ttl?: number; // milliseconds, optional
}

export interface RequestCache {
  /**
   * Get a value from cache.
   * Returns undefined if key not found or entry is stale (TTL exceeded).
   */
  get<T = unknown>(key: string): T | undefined;

  /**
   * Set a value in cache with optional TTL.
   * @param key - Cache key (recommend: "domain:id:context" format)
   * @param value - Value to cache
   * @param ttl - Optional time-to-live in milliseconds
   */
  set<T = unknown>(key: string, value: T, ttl?: number): void;

  /**
   * Check if key exists and is not stale.
   */
  has(key: string): boolean;

  /**
   * Delete a specific key from cache.
   */
  delete(key: string): void;

  /**
   * Clear entire cache.
   */
  clear(): void;

  /**
   * Get cache stats for debugging.
   */
  stats(): { size: number; keys: string[] };
}

/**
 * Create a new request-scoped cache.
 * Call once per request, store in request locals or pass via context.
 */
export function createRequestCache(): RequestCache {
  const cache = new Map<string, CacheEntry>();

  function isStale(entry: CacheEntry): boolean {
    if (!entry.ttl) return false;
    const age = Date.now() - entry.timestamp;
    return age > entry.ttl;
  }

  return {
    get<T = unknown>(key: string): T | undefined {
      const entry = cache.get(key);
      if (!entry) return undefined;
      if (isStale(entry)) {
        cache.delete(key);
        return undefined;
      }
      return entry.value as T;
    },

    set<T = unknown>(key: string, value: T, ttl?: number): void {
      cache.set(key, {
        value,
        timestamp: Date.now(),
        ttl,
      });
    },

    has(key: string): boolean {
      const entry = cache.get(key);
      if (!entry) return false;
      if (isStale(entry)) {
        cache.delete(key);
        return false;
      }
      return true;
    },

    delete(key: string): void {
      cache.delete(key);
    },

    clear(): void {
      cache.clear();
    },

    stats(): { size: number; keys: string[] } {
      return {
        size: cache.size,
        keys: Array.from(cache.keys()),
      };
    },
  };
}

/**
 * Helper to compute cache key for capability lookups.
 * Format: "cap:userId:orgId:capability"
 */
export function getCapabilityCacheKey(
  userId: string,
  orgId: string,
  capability?: string
): string {
  if (capability) {
    return `cap:${userId}:${orgId}:${capability}`;
  }
  return `cap:${userId}:${orgId}`;
}

/**
 * Helper to compute cache key for override lookups.
 * Format: "overrides:userId:orgId"
 */
export function getOverrideCacheKey(userId: string, orgId: string): string {
  return `overrides:${userId}:${orgId}`;
}

/**
 * Helper to compute cache key for role capability lookups.
 * Format: "role_caps:role"
 */
export function getRoleCapabilitiesCacheKey(role: string): string {
  return `role_caps:${role}`;
}
