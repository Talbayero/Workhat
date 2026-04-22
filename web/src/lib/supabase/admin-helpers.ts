/**
 * admin-helpers.ts
 *
 * Consolidated admin client error handling utilities.
 *
 * Eliminates boilerplate pattern repetition across 19+ files:
 *   const { client, reason } = createOptionalAdminClient();
 *   if (!client) {
 *     // ... error handling (throw, log, return, etc.)
 *   }
 *
 * Instead, use:
 *   const client = getAdminClientOrThrow(label);
 *   // ... use client with confidence
 *
 * Or with custom error handling:
 *   const client = getAdminClientOrLog(label, "warn");
 *   if (!client) return fallbackValue;
 */

import { createOptionalAdminClient, type AdminClientResult } from "./admin";

/**
 * Get admin client or throw an error if unavailable.
 *
 * Use when the calling code cannot handle missing client gracefully.
 * The error message includes the reason from createOptionalAdminClient.
 *
 * Example:
 *   const client = getAdminClientOrThrow("capability-lookup");
 *   const roles = await client.from("role_capabilities").select("*");
 */
export function getAdminClientOrThrow(label: string) {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    throw new Error(`[${label}] Admin client unavailable: ${adminState.reason}`);
  }
  return adminState.client;
}

/**
 * Get admin client or log an error if unavailable, returning null.
 *
 * Use when the calling code has a fallback strategy (e.g., use preset values).
 * Logs an error message with the reason to console.error.
 *
 * Example:
 *   const client = getAdminClientOrLogError("audit-lookup");
 *   if (!client) {
 *     return useDefaultAuditFallback();
 *   }
 *   const logs = await client.from("audit_logs").select("*");
 */
export function getAdminClientOrLogError(label: string) {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.error(`[${label}] Admin client unavailable: ${adminState.reason}`);
    return null;
  }
  return adminState.client;
}

/**
 * Get admin client or log a warning if unavailable, returning null.
 *
 * Use when missing client is non-critical (e.g., optional capability override lookup).
 * Logs a warning message with the reason to console.warn.
 *
 * Example:
 *   const client = getAdminClientOrLogWarn("capability-overrides");
 *   if (!client) {
 *     return presetCapabilitiesForRole(user.role);
 *   }
 *   const overrides = await client.from("user_capability_overrides").select("*");
 */
export function getAdminClientOrLogWarn(label: string) {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    console.warn(`[${label}] Admin client unavailable: ${adminState.reason}`);
    return null;
  }
  return adminState.client;
}

/**
 * Advanced: Get admin client state with custom error handler.
 *
 * Use when you need custom error handling logic or want to track reasons.
 * The onError callback receives the AdminClientResult when client is null.
 *
 * Example:
 *   const client = getAdminClientOrHandle("conversation-lookup", (state) => {
 *     if (state.reason === "missing_env") {
 *       // Different handling for configuration vs. auth issues
 *       initializeDefaultConfig();
 *     }
 *   });
 *   if (!client) return null;
 *   const convs = await client.from("conversations").select("*");
 */
export function getAdminClientOrHandle(
  label: string,
  onError: (state: Exclude<AdminClientResult, { client: any; client: null }>) => void
) {
  const adminState = createOptionalAdminClient();
  if (!adminState.client) {
    onError(adminState as any);
    return null;
  }
  return adminState.client;
}

/**
 * Check if admin client is available without logging.
 *
 * Use in conditional logic to decide between two execution paths.
 * Useful for metrics collection or quiet availability checks.
 *
 * Example:
 *   if (isAdminClientAvailable()) {
 *     return await fetchViaDatabaseWithCapabilityCheck();
 *   } else {
 *     return cachedOrDefaultValue();
 *   }
 */
export function isAdminClientAvailable(): boolean {
  const adminState = createOptionalAdminClient();
  return adminState.client !== null;
}
