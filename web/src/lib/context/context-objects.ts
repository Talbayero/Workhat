import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditAction } from "@/lib/security/audit-logger";
import { logAudit } from "@/lib/security/audit-logger";
import {
  type ContextDraftSelection,
  type ContextFormInput,
  type ContextKnowledgeSummary,
  type ContextListStatusFilter,
  type ContextObjectDetail,
  type ContextObjectRecord,
  type ContextObjectSummary,
  type ContextVersionRecord,
  normalizeContextDefinition,
} from "@/lib/context/types";

type SelectClient = {
  from: ReturnType<typeof createAdminClient>["from"];
};

type DbObjectRow = ContextObjectRecord & {
  companies?:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
};

type DbVersionRow = ContextVersionRecord;

type DbKnowledgeEntryRow = {
  id: string;
  title: string;
  summary: string;
  category: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOptionalUuid(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  return UUID_RE.test(normalized) ? normalized : null;
}

function normalizeSummary(
  row: DbObjectRow,
  versionsById: Map<string, ContextVersionRecord>
): ContextObjectSummary {
  const currentVersion = row.current_version_id ? versionsById.get(row.current_version_id) ?? null : null;
  const activeVersion = row.active_version_id ? versionsById.get(row.active_version_id) ?? null : null;

  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    companyId: row.company_id,
    companyName: company?.name ?? null,
    ownerUserId: row.owner_user_id,
    reviewerUserId: row.reviewer_user_id,
    currentVersionId: row.current_version_id,
    currentVersionNumber: currentVersion?.version_number ?? null,
    activeVersionId: row.active_version_id,
    activeVersionNumber: activeVersion?.version_number ?? null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

async function fetchVersionsForObjects(
  supabase: SelectClient,
  orgId: string,
  contextObjectIds: string[]
) {
  if (contextObjectIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("context_object_versions")
    .select("id, org_id, context_object_id, version_number, title, description, context_definition_json, created_by_user_id, created_at")
    .eq("org_id", orgId)
    .in("context_object_id", contextObjectIds)
    .order("version_number", { ascending: false });

  if (error) {
    throw new Error(`Unable to load context versions: ${error.message}`);
  }

  return ((data ?? []) as DbVersionRow[]).map((row) => ({
    ...row,
    context_definition_json: normalizeContextDefinition(row.context_definition_json),
  }));
}

async function fetchKnowledgeEntriesByIds(
  supabase: SelectClient,
  orgId: string,
  knowledgeEntryIds: string[]
): Promise<ContextKnowledgeSummary[]> {
  if (knowledgeEntryIds.length === 0) return [];

  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("id, title, summary, category")
    .eq("org_id", orgId)
    .in("id", knowledgeEntryIds)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Unable to load linked knowledge entries: ${error.message}`);
  }

  const byId = new Map(
    ((data ?? []) as DbKnowledgeEntryRow[]).map((row) => [
      row.id,
      { id: row.id, title: row.title, summary: row.summary, category: row.category },
    ])
  );

  return knowledgeEntryIds
    .map((id) => byId.get(id))
    .filter((entry): entry is ContextKnowledgeSummary => Boolean(entry));
}

async function ensureScopedCompany(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  companyId: string | null
) {
  const normalizedCompanyId = normalizeOptionalUuid(companyId);
  if (!normalizedCompanyId) return null;

  const { data, error } = await admin
    .from("companies")
    .select("id")
    .eq("id", normalizedCompanyId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Unable to verify the linked company: ${error.message}`);
  if (!data) throw new Error("Linked company not found for this workspace.");
  return normalizedCompanyId;
}

async function ensureScopedUser(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  userId: string | null
) {
  const normalizedUserId = normalizeOptionalUuid(userId);
  if (!normalizedUserId) return null;

  const { data, error } = await admin
    .from("users")
    .select("id")
    .eq("id", normalizedUserId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Unable to verify the linked user: ${error.message}`);
  if (!data) throw new Error("Linked user not found for this workspace.");
  return normalizedUserId;
}

async function ensureKnowledgeEntriesBelongToOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  knowledgeEntryIds: string[]
) {
  if (knowledgeEntryIds.length === 0) return [];

  const { data, error } = await admin
    .from("knowledge_entries")
    .select("id")
    .eq("org_id", orgId)
    .in("id", knowledgeEntryIds);

  if (error) throw new Error(`Unable to verify linked knowledge entries: ${error.message}`);

  const foundIds = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
  const missing = knowledgeEntryIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error("One or more linked knowledge entries were not found for this workspace.");
  }

  return knowledgeEntryIds;
}

function sanitizeContextFormInput(input: ContextFormInput) {
  const contextDefinition = normalizeContextDefinition(input.contextDefinition);
  return {
    title: input.title.trim().slice(0, 500),
    description: input.description.trim().slice(0, 4_000),
    category: input.category.trim().slice(0, 100) || "general",
    companyId: normalizeOptionalUuid(input.companyId),
    ownerUserId: normalizeOptionalUuid(input.ownerUserId),
    reviewerUserId: normalizeOptionalUuid(input.reviewerUserId),
    contextDefinition,
  };
}

async function getNextVersionNumber(
  admin: ReturnType<typeof createAdminClient>,
  contextObjectId: string
) {
  const { data, error } = await admin
    .from("context_object_versions")
    .select("version_number")
    .eq("context_object_id", contextObjectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Unable to load context version history: ${error.message}`);
  return ((data as { version_number?: number } | null)?.version_number ?? 0) + 1;
}

async function getObjectWithCompany(
  supabase: SelectClient,
  orgId: string,
  contextId: string
) {
  const { data, error } = await supabase
    .from("context_objects")
    .select("id, org_id, company_id, title, description, category, status, owner_user_id, reviewer_user_id, current_version_id, active_version_id, created_at, updated_at, published_at, companies(id, name)")
    .eq("id", contextId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`Unable to load context object: ${error.message}`);
  return (data as DbObjectRow | null) ?? null;
}

async function logContextAudit(params: {
  action: AuditAction;
  orgId: string;
  actorId: string;
  actorRole: string;
  resourceId: string;
  newValues?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
}) {
  await logAudit({
    action: params.action,
    orgId: params.orgId,
    actorId: params.actorId,
    actorRole: params.actorRole,
    resourceType: "context_object",
    resourceId: params.resourceId,
    newValues: params.newValues ?? null,
    oldValues: params.oldValues ?? null,
  });
}

export async function listContextObjectsForOrg(params: {
  supabase: SelectClient;
  orgId: string;
  status?: ContextListStatusFilter;
}) {
  const { supabase, orgId, status = "all" } = params;
  let query = supabase
    .from("context_objects")
    .select("id, org_id, company_id, title, description, category, status, owner_user_id, reviewer_user_id, current_version_id, active_version_id, created_at, updated_at, published_at, companies(id, name)")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Unable to load context objects: ${error.message}`);

  const objects = (data ?? []) as unknown as DbObjectRow[];
  const versions = await fetchVersionsForObjects(
    supabase,
    orgId,
    objects.map((row) => row.id)
  );
  const versionsById = new Map(versions.map((row) => [row.id, row]));

  return objects.map((row) => normalizeSummary(row, versionsById));
}

export async function getContextObjectDetail(params: {
  supabase: SelectClient;
  orgId: string;
  contextId: string;
}) {
  const { supabase, orgId, contextId } = params;
  const object = await getObjectWithCompany(supabase, orgId, contextId);
  if (!object) return null;

  const versions = await fetchVersionsForObjects(supabase, orgId, [contextId]);
  const versionsById = new Map(versions.map((row) => [row.id, row]));
  const currentVersion = object.current_version_id ? versionsById.get(object.current_version_id) ?? null : null;
  const activeVersion = object.active_version_id ? versionsById.get(object.active_version_id) ?? null : null;
  const linkedKnowledgeEntries = await fetchKnowledgeEntriesByIds(
    supabase,
    orgId,
    currentVersion?.context_definition_json.knowledge_entry_ids ?? []
  );

  return {
    ...normalizeSummary(object, versionsById),
    currentVersion,
    activeVersion,
    versions,
    linkedKnowledgeEntries,
  } satisfies ContextObjectDetail;
}

export async function createContextObject(params: {
  orgId: string;
  actorId: string;
  actorRole: string;
  input: ContextFormInput;
}) {
  const { orgId, actorId, actorRole, input } = params;
  const admin = createAdminClient();
  const sanitized = sanitizeContextFormInput(input);

  if (!sanitized.title) {
    throw new Error("Context title is required.");
  }

  await ensureKnowledgeEntriesBelongToOrg(admin, orgId, sanitized.contextDefinition.knowledge_entry_ids);
  const [companyId, ownerUserId, reviewerUserId] = await Promise.all([
    ensureScopedCompany(admin, orgId, sanitized.companyId),
    ensureScopedUser(admin, orgId, sanitized.ownerUserId),
    ensureScopedUser(admin, orgId, sanitized.reviewerUserId),
  ]);

  const { data: createdObject, error: objectError } = await admin
    .from("context_objects")
    .insert({
      org_id: orgId,
      company_id: companyId,
      title: sanitized.title,
      description: sanitized.description,
      category: sanitized.category,
      status: "draft",
      owner_user_id: ownerUserId,
      reviewer_user_id: reviewerUserId,
    })
    .select("id")
    .single();

  if (objectError || !createdObject) {
    throw new Error(`Unable to create context object: ${objectError?.message ?? "unknown error"}`);
  }

  const contextId = (createdObject as { id: string }).id;
  const { data: createdVersion, error: versionError } = await admin
    .from("context_object_versions")
    .insert({
      org_id: orgId,
      context_object_id: contextId,
      version_number: 1,
      title: sanitized.title,
      description: sanitized.description,
      context_definition_json: sanitized.contextDefinition,
      created_by_user_id: actorId,
    })
    .select("id")
    .single();

  if (versionError || !createdVersion) {
    throw new Error(`Unable to create context version: ${versionError?.message ?? "unknown error"}`);
  }

  const versionId = (createdVersion as { id: string }).id;
  const { error: updateObjectError } = await admin
    .from("context_objects")
    .update({ current_version_id: versionId })
    .eq("id", contextId)
    .eq("org_id", orgId);

  if (updateObjectError) {
    throw new Error(`Unable to finalize context object: ${updateObjectError.message}`);
  }

  await logContextAudit({
    action: "context.created",
    orgId,
    actorId,
    actorRole,
    resourceId: contextId,
    newValues: {
      title: sanitized.title,
      category: sanitized.category,
      status: "draft",
      versionNumber: 1,
    },
  });

  return contextId;
}

export async function updateContextObject(params: {
  orgId: string;
  contextId: string;
  actorId: string;
  actorRole: string;
  input: ContextFormInput;
}) {
  const { orgId, contextId, actorId, actorRole, input } = params;
  const admin = createAdminClient();
  const existing = await getObjectWithCompany(admin, orgId, contextId);
  if (!existing) throw new Error("Context object not found for this workspace.");

  const sanitized = sanitizeContextFormInput(input);
  if (!sanitized.title) {
    throw new Error("Context title is required.");
  }

  await ensureKnowledgeEntriesBelongToOrg(admin, orgId, sanitized.contextDefinition.knowledge_entry_ids);
  const [companyId, ownerUserId, reviewerUserId] = await Promise.all([
    ensureScopedCompany(admin, orgId, sanitized.companyId),
    ensureScopedUser(admin, orgId, sanitized.ownerUserId),
    ensureScopedUser(admin, orgId, sanitized.reviewerUserId),
  ]);

  const nextVersionNumber = await getNextVersionNumber(admin, contextId);
  const { data: version, error: versionError } = await admin
    .from("context_object_versions")
    .insert({
      org_id: orgId,
      context_object_id: contextId,
      version_number: nextVersionNumber,
      title: sanitized.title,
      description: sanitized.description,
      context_definition_json: sanitized.contextDefinition,
      created_by_user_id: actorId,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    throw new Error(`Unable to create the updated context version: ${versionError?.message ?? "unknown error"}`);
  }

  const versionId = (version as { id: string }).id;
  const { error: updateError } = await admin
    .from("context_objects")
    .update({
      company_id: companyId,
      title: sanitized.title,
      description: sanitized.description,
      category: sanitized.category,
      owner_user_id: ownerUserId,
      reviewer_user_id: reviewerUserId,
      current_version_id: versionId,
    })
    .eq("id", contextId)
    .eq("org_id", orgId);

  if (updateError) {
    throw new Error(`Unable to update context object: ${updateError.message}`);
  }

  await logContextAudit({
    action: "context.updated",
    orgId,
    actorId,
    actorRole,
    resourceId: contextId,
    oldValues: {
      title: existing.title,
      category: existing.category,
      status: existing.status,
      currentVersionId: existing.current_version_id,
    },
    newValues: {
      title: sanitized.title,
      category: sanitized.category,
      status: existing.status,
      currentVersionId: versionId,
      versionNumber: nextVersionNumber,
    },
  });

  return versionId;
}

export async function publishContextObject(params: {
  orgId: string;
  contextId: string;
  actorId: string;
  actorRole: string;
}) {
  const { orgId, contextId, actorId, actorRole } = params;
  const admin = createAdminClient();
  const existing = await getObjectWithCompany(admin, orgId, contextId);
  if (!existing) throw new Error("Context object not found for this workspace.");
  if (!existing.current_version_id) throw new Error("Context object has no current version to publish.");

  const publishedAt = new Date().toISOString();
  const { error } = await admin
    .from("context_objects")
    .update({
      status: "active",
      active_version_id: existing.current_version_id,
      published_at: publishedAt,
    })
    .eq("id", contextId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Unable to publish context object: ${error.message}`);
  }

  await logContextAudit({
    action: "context.published",
    orgId,
    actorId,
    actorRole,
    resourceId: contextId,
    oldValues: {
      status: existing.status,
      activeVersionId: existing.active_version_id,
    },
    newValues: {
      status: "active",
      activeVersionId: existing.current_version_id,
      publishedAt,
    },
  });
}

export async function archiveContextObject(params: {
  orgId: string;
  contextId: string;
  actorId: string;
  actorRole: string;
}) {
  const { orgId, contextId, actorId, actorRole } = params;
  const admin = createAdminClient();
  const existing = await getObjectWithCompany(admin, orgId, contextId);
  if (!existing) throw new Error("Context object not found for this workspace.");

  const { error } = await admin
    .from("context_objects")
    .update({ status: "archived" })
    .eq("id", contextId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Unable to archive context object: ${error.message}`);
  }

  await logContextAudit({
    action: "context.archived",
    orgId,
    actorId,
    actorRole,
    resourceId: contextId,
    oldValues: { status: existing.status },
    newValues: { status: "archived" },
  });
}

export async function resolveDraftContextSelection(params: {
  supabase: SelectClient;
  orgId: string;
  contextObjectId: string;
}): Promise<ContextDraftSelection | null> {
  const { supabase, orgId, contextObjectId } = params;
  const object = await getObjectWithCompany(supabase, orgId, contextObjectId);
  if (!object || object.status !== "active" || !object.active_version_id) {
    return null;
  }

  const versions = await fetchVersionsForObjects(supabase, orgId, [contextObjectId]);
  const activeVersion = versions.find((row) => row.id === object.active_version_id) ?? null;
  if (!activeVersion) return null;

  const linkedKnowledgeEntries = await fetchKnowledgeEntriesByIds(
    supabase,
    orgId,
    activeVersion.context_definition_json.knowledge_entry_ids
  );

  return {
    id: object.id,
    versionId: activeVersion.id,
    title: activeVersion.title,
    description: activeVersion.description,
    category: object.category,
    companyName: (Array.isArray(object.companies) ? object.companies[0] : object.companies)?.name ?? null,
    versionNumber: activeVersion.version_number,
    contextDefinition: activeVersion.context_definition_json,
    linkedKnowledgeEntries,
  };
}
