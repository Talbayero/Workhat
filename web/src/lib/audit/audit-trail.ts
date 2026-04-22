import type { CurrentAppUser } from "@/lib/auth/app-user";
import { getAdminClientOrThrow } from "@/lib/supabase/admin-helpers";

export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "auth.login_failed",
  "auth.password_reset",
  "auth.mfa_enrolled",
  "auth.mfa_verified",
  "user.created",
  "user.updated",
  "user.role_changed",
  "user.deactivated",
  "user.deleted",
  "user.invite_sent",
  "org.settings_updated",
  "org.name_changed",
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "company.created",
  "company.updated",
  "company.deleted",
  "knowledge.created",
  "knowledge.updated",
  "knowledge.deleted",
  "conversation.created",
  "conversation.updated",
  "conversation.resolved",
  "conversation.archived",
  "conversation.assigned",
  "conversation.deleted",
  "ai.draft_generated",
  "ai.draft_accepted",
  "ai.draft_edited",
  "billing.plan_changed",
  "billing.payment_succeeded",
  "billing.payment_failed",
  "security.rate_limit_hit",
  "security.suspicious_request",
  "security.webhook_auth_failed",
  "data.export_requested",
  "data.deletion_requested",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditTrailFilters = {
  actor?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  orgId?: string;
  offset?: number;
  page?: number;
  pageSize?: number;
};

export type AuditTrailLog = {
  id: string;
  org_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  resource_label: string | null;
  old_values: Record<string, unknown> | unknown[] | null;
  new_values: Record<string, unknown> | unknown[] | null;
  ip_address: string | null;
  user_agent: string | null;
  success: boolean;
  error_message: string | null;
  created_at: string;
};

export type AuditTrailFacet = {
  value: string;
  label: string;
};

export type AuditTrailResult = {
  logs: AuditTrailLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filters: Required<Pick<AuditTrailFilters, "page" | "pageSize">> & Omit<AuditTrailFilters, "page" | "pageSize">;
  facets: {
    actions: AuditTrailFacet[];
    actors: AuditTrailFacet[];
    entityTypes: AuditTrailFacet[];
  };
  orgScope: {
    id: string;
    label: string;
  };
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function normalizeDateStart(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  return `${value}T00:00:00.000Z`;
}

function normalizeDateEnd(value: string) {
  if (!value) return "";
  if (value.includes("T")) return value;
  return `${value}T23:59:59.999Z`;
}

export function parseAuditTrailFilters(input: Record<string, unknown>): AuditTrailFilters {
  return {
    actor: clean(input.actor),
    action: clean(input.action),
    entityType: clean(input.entityType),
    entityId: clean(input.entityId),
    from: clean(input.from),
    to: clean(input.to),
    orgId: clean(input.orgId),
    offset: typeof input.offset === "undefined" ? undefined : Math.max(Number.parseInt(String(input.offset), 10) || 0, 0),
    page: positiveInt(input.page, 1),
    pageSize: positiveInt(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function applyAuditFilters<T extends { eq: (column: string, value: string) => T; ilike: (column: string, value: string) => T; gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  filters: AuditTrailFilters
) {
  if (filters.actor) {
    query = isUuid(filters.actor)
      ? query.eq("actor_id", filters.actor)
      : query.ilike("actor_email", `%${filters.actor.replace(/[%_]/g, "")}%`);
  }
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.entityType) query = query.eq("resource_type", filters.entityType);
  if (filters.entityId && isUuid(filters.entityId)) query = query.eq("resource_id", filters.entityId);
  if (filters.from) query = query.gte("created_at", normalizeDateStart(filters.from));
  if (filters.to) query = query.lte("created_at", normalizeDateEnd(filters.to));
  return query;
}

function uniqueFacets(rows: AuditTrailLog[]) {
  const actorMap = new Map<string, string>();
  const entityTypes = new Set<string>();

  for (const row of rows) {
    if (row.actor_id || row.actor_email) {
      const value = row.actor_id ?? row.actor_email ?? "";
      const label = row.actor_email ?? row.actor_id ?? "Unknown actor";
      if (value) actorMap.set(value, label);
    }
    if (row.resource_type) entityTypes.add(row.resource_type);
  }

  return {
    actors: [...actorMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    entityTypes: [...entityTypes]
      .sort()
      .map((value) => ({ value, label: value })),
  };
}

export async function getAuditTrail(appUser: CurrentAppUser, filters: AuditTrailFilters): Promise<AuditTrailResult> {
  const client = getAdminClientOrThrow("audit-trail");

  const page = positiveInt(filters.page, 1);
  const pageSize = positiveInt(filters.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = Math.max(Number(filters.offset ?? (page - 1) * pageSize) || 0, 0);

  // Org scope is intentionally locked to the caller's org. If the UI sends an
  // orgId, it must match the current org; otherwise we return the current org.
  const scopedFilters = {
    ...filters,
    orgId: filters.orgId && filters.orgId !== appUser.org_id ? appUser.org_id : appUser.org_id,
    page,
    pageSize,
  };

  let query = client
    .from("audit_logs")
    .select(
      "id, org_id, actor_id, actor_email, actor_role, action, resource_type, resource_id, resource_label, old_values, new_values, ip_address, user_agent, success, error_message, created_at",
      { count: "exact" }
    )
    .eq("org_id", appUser.org_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);

  query = applyAuditFilters(query, scopedFilters);

  const [logsResult, facetResult] = await Promise.all([
    query,
    client
      .from("audit_logs")
      .select("id, org_id, actor_id, actor_email, actor_role, action, resource_type, resource_id, resource_label, old_values, new_values, ip_address, user_agent, success, error_message, created_at")
      .eq("org_id", appUser.org_id)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (logsResult.error) {
    throw new Error(`Unable to fetch audit logs: ${logsResult.error.message}`);
  }

  if (facetResult.error) {
    console.warn("[audit-trail] facet lookup failed:", facetResult.error.message);
  }

  const logs = (logsResult.data ?? []) as AuditTrailLog[];
  const facetRows = (facetResult.data ?? []) as AuditTrailLog[];
  const unique = uniqueFacets(facetRows);
  const total = logsResult.count ?? 0;

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    filters: scopedFilters,
    facets: {
      actions: AUDIT_ACTIONS.map((value) => ({ value, label: value })),
      ...unique,
    },
    orgScope: {
      id: appUser.org_id,
      label: "Current workspace",
    },
  };
}
