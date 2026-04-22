/**
 * audit-logger.ts
 *
 * Thin wrapper around the audit_logs table.  All writes go through the Supabase
 * service-role (admin) client so they bypass RLS and succeed regardless of the
 * caller's authentication state.
 *
 * Usage:
 *   import { logAudit } from "@/lib/security/audit-logger";
 *
 *   await logAudit({
 *     action: "user.role_changed",
 *     orgId: appUser.org_id,
 *     actorId: appUser.id,
 *     actorEmail: appUser.email,
 *     actorRole: appUser.role,
 *     resourceType: "user",
 *     resourceId: targetUserId,
 *     resourceLabel: targetEmail,
 *     oldValues: { role: "agent" },
 *     newValues: { role: "manager" },
 *     req,
 *   });
 *
 * Design notes:
 *   • Never throws — errors are swallowed with console.error so audit failures
 *     never break the calling request.
 *   • IP / user-agent are extracted from the request when provided.
 *   • All string fields are truncated to safe lengths before insert.
 */

import { getAdminClientOrLogError } from "@/lib/supabase/admin-helpers";
import type { NextRequest } from "next/server";

// ── Action type — must match the audit_action enum in migration 0027 ──────────
export type AuditAction =
  // Auth
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed"
  | "auth.password_reset"
  | "auth.mfa_enrolled"
  | "auth.mfa_verified"
  // User management
  | "user.created"
  | "user.updated"
  | "user.role_changed"
  | "user.deactivated"
  | "user.deleted"
  | "user.invite_sent"
  // Org settings
  | "org.settings_updated"
  | "org.name_changed"
  // Contacts & Companies
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "company.created"
  | "company.updated"
  | "company.deleted"
  // Knowledge base
  | "knowledge.created"
  | "knowledge.updated"
  | "knowledge.deleted"
  // Conversations
  | "conversation.created"
  | "conversation.updated"
  | "conversation.resolved"
  | "conversation.archived"
  | "conversation.assigned"
  | "conversation.deleted"
  // AI
  | "ai.draft_generated"
  | "ai.draft_accepted"
  | "ai.draft_edited"
  // Billing
  | "billing.plan_changed"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  // Security events
  | "security.rate_limit_hit"
  | "security.suspicious_request"
  | "security.webhook_auth_failed"
  // Data subject rights
  | "data.export_requested"
  | "data.deletion_requested"
  // Intent configuration
  | "intent.created"
  | "intent.updated"
  | "intent.deleted"
  | "intent.correction_submitted"
  // QA
  | "qa.review_submitted";

export interface AuditEvent {
  action: AuditAction;

  // Tenant context
  orgId?: string | null;

  // Actor (who did it)
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;

  // Affected resource
  resourceType?: string | null;
  resourceId?: string | null;
  resourceLabel?: string | null;   // e.g. contact full_name, user email

  // State delta
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;

  // Outcome
  success?: boolean;
  errorMessage?: string | null;

  // Request context (for IP / user-agent extraction)
  req?: NextRequest | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// ── IP extraction ─────────────────────────────────────────────────────────────
function extractIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first (leftmost) IP
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 45); // max IPv6 length
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function logAudit(event: AuditEvent): Promise<void> {
  const client = getAdminClientOrLogError("[audit-logger] Admin client unavailable — cannot write audit log");
  if (!client) {
    return;
  }

  const ipAddress = event.ipAddress
    ?? (event.req ? extractIp(event.req) : null);

  const userAgent = event.userAgent
    ?? (event.req ? (event.req.headers.get("user-agent") ?? null) : null);

  try {
    const { error } = await client.from("audit_logs").insert({
      org_id:         event.orgId     ?? null,
      actor_id:       event.actorId   ?? null,
      actor_email:    event.actorEmail   ? event.actorEmail.slice(0, 254)   : null,
      actor_role:     event.actorRole    ? event.actorRole.slice(0, 50)     : null,
      action:         event.action,
      resource_type:  event.resourceType  ? event.resourceType.slice(0, 100)  : null,
      resource_id:    event.resourceId    ?? null,
      resource_label: event.resourceLabel ? event.resourceLabel.slice(0, 500) : null,
      old_values:     event.oldValues  ?? null,
      new_values:     event.newValues  ?? null,
      ip_address:     ipAddress,
      user_agent:     userAgent ? userAgent.slice(0, 500) : null,
      success:        event.success ?? true,
      error_message:  event.errorMessage ? event.errorMessage.slice(0, 1000) : null,
    });

    if (error) {
      console.error("[audit-logger] Insert failed:", error.message);
    }
  } catch (err) {
    // Never let audit logging break the calling request.
    console.error("[audit-logger] Unexpected error:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Convenience wrapper for security/anomaly events that don't have a full actor context.
 */
export async function logSecurityEvent(
  action: Extract<AuditAction, `security.${string}`>,
  opts: { req?: NextRequest; orgId?: string; detail?: string }
): Promise<void> {
  await logAudit({
    action,
    orgId: opts.orgId ?? null,
    success: false,
    errorMessage: opts.detail ?? null,
    req: opts.req ?? null,
  });
}
