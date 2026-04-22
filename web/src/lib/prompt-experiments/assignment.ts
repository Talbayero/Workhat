import { createHash } from "crypto";
import { PROMPT_VERSION } from "@/lib/ai";
import type { PromptConfig } from "@/lib/ai/types";
import type {
  PromptAssignment,
  PromptExperimentRow,
  PromptVariantRow,
  PromptVersionRow,
  SupabaseServerClient,
} from "@/lib/prompt-experiments/types";

function bucketFor(input: string) {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 8);
  return parseInt(hex, 16) % 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePromptConfig(value: unknown): PromptConfig {
  if (!isRecord(value)) return {};
  const config: PromptConfig = {};
  if (typeof value.systemAppend === "string") config.systemAppend = value.systemAppend.slice(0, 4000);
  if (typeof value.userAppend === "string") config.userAppend = value.userAppend.slice(0, 4000);
  if (typeof value.temperature === "number" && value.temperature >= 0 && value.temperature <= 1) {
    config.temperature = value.temperature;
  }
  return config;
}

function mergeConfig(base: PromptConfig, override: PromptConfig): PromptConfig {
  return {
    ...base,
    ...override,
  };
}

async function loadVersionConfig(
  db: SupabaseServerClient,
  orgId: string,
  promptVersion: string
): Promise<PromptConfig> {
  const { data, error } = await db
    .from("ai_prompt_versions")
    .select("version_key, config_json")
    .eq("org_id", orgId)
    .eq("version_key", promptVersion)
    .maybeSingle();

  if (error) {
    console.warn("[prompt-experiments] version config lookup failed:", error.message);
    return {};
  }

  return parsePromptConfig((data as PromptVersionRow | null)?.config_json);
}

function chooseVariant({
  experiment,
  variants,
  conversationId,
}: {
  experiment: PromptExperimentRow;
  variants: PromptVariantRow[];
  conversationId: string;
}) {
  const bucket = bucketFor(`${experiment.org_id}:${experiment.id}:${experiment.traffic_seed}:${conversationId}`);
  let cursor = 0;

  for (const variant of variants) {
    cursor += variant.allocation_percent;
    if (bucket < cursor) return { bucket, variant };
  }

  const fallback = variants.find((variant) => variant.is_control) ?? variants[0] ?? null;
  return { bucket, variant: fallback };
}

async function buildFallbackAssignment({
  db,
  orgId,
  conversationId,
  promptVersion,
  reason,
}: {
  db: SupabaseServerClient;
  orgId: string;
  conversationId: string;
  promptVersion: string;
  reason: PromptAssignment["reason"];
}): Promise<PromptAssignment> {
  const promptConfig = await loadVersionConfig(db, orgId, promptVersion);
  return {
    assignmentId: null,
    experimentId: null,
    promptVersion,
    promptConfig,
    assignmentKey: `${orgId}:stable:${conversationId}`,
    bucket: null,
    reason,
  };
}

export async function assignPromptVersion({
  db,
  orgId,
  conversationId,
}: {
  db: SupabaseServerClient;
  orgId: string;
  conversationId: string;
}): Promise<PromptAssignment> {
  const { data: experimentData, error: experimentError } = await db
    .from("ai_prompt_experiments")
    .select("id, org_id, name, status, traffic_seed, stable_version_key, rollback_version_key")
    .eq("org_id", orgId)
    .in("status", ["running", "rolled_back"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (experimentError) {
    console.warn("[prompt-experiments] experiment lookup failed:", experimentError.message);
  }

  const experiment = experimentData as PromptExperimentRow | null;
  if (!experiment) {
    return buildFallbackAssignment({
      db,
      orgId,
      conversationId,
      promptVersion: PROMPT_VERSION,
      reason: "stable_fallback",
    });
  }

  if (experiment.status === "rolled_back") {
    return buildFallbackAssignment({
      db,
      orgId,
      conversationId,
      promptVersion: experiment.rollback_version_key || experiment.stable_version_key || PROMPT_VERSION,
      reason: "rolled_back",
    });
  }

  const { data: existing } = await db
    .from("ai_prompt_assignments")
    .select("id, prompt_version_key, assignment_key, bucket")
    .eq("org_id", orgId)
    .eq("experiment_id", experiment.id)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; prompt_version_key: string; assignment_key: string; bucket: number | null };
    return {
      assignmentId: row.id,
      experimentId: experiment.id,
      promptVersion: row.prompt_version_key,
      promptConfig: await loadVersionConfig(db, orgId, row.prompt_version_key),
      assignmentKey: row.assignment_key,
      bucket: row.bucket,
      reason: "sticky_assignment",
    };
  }

  const { data: variantData, error: variantError } = await db
    .from("ai_prompt_experiment_variants")
    .select("id, org_id, experiment_id, prompt_version_key, allocation_percent, is_control, config_json")
    .eq("org_id", orgId)
    .eq("experiment_id", experiment.id)
    .gt("allocation_percent", 0)
    .order("is_control", { ascending: false })
    .order("created_at", { ascending: true });

  if (variantError) {
    console.warn("[prompt-experiments] variant lookup failed:", variantError.message);
  }

  const variants = (variantData ?? []) as PromptVariantRow[];
  const totalAllocation = variants.reduce((sum, variant) => sum + variant.allocation_percent, 0);
  if (variants.length === 0 || totalAllocation <= 0) {
    return buildFallbackAssignment({
      db,
      orgId,
      conversationId,
      promptVersion: experiment.stable_version_key || PROMPT_VERSION,
      reason: "stable_fallback",
    });
  }

  const { bucket, variant } = chooseVariant({ experiment, variants, conversationId });
  const promptVersion = variant?.prompt_version_key ?? experiment.stable_version_key ?? PROMPT_VERSION;
  const versionConfig = await loadVersionConfig(db, orgId, promptVersion);
  const variantConfig = parsePromptConfig(variant?.config_json);
  const assignmentKey = `${orgId}:${experiment.id}:${conversationId}`;

  const { data: inserted, error: insertError } = await db
    .from("ai_prompt_assignments")
    .insert({
      org_id: orgId,
      experiment_id: experiment.id,
      conversation_id: conversationId,
      prompt_version_key: promptVersion,
      assignment_key: assignmentKey,
      bucket,
      reason: "experiment",
    })
    .select("id")
    .single();

  if (insertError) {
    console.warn("[prompt-experiments] assignment insert failed:", insertError.message);
  }

  return {
    assignmentId: (inserted as { id?: string } | null)?.id ?? null,
    experimentId: experiment.id,
    promptVersion,
    promptConfig: mergeConfig(versionConfig, variantConfig),
    assignmentKey,
    bucket,
    reason: "experiment",
  };
}

export async function linkPromptAssignmentToDraft({
  db,
  assignmentId,
  draftId,
}: {
  db: SupabaseServerClient;
  assignmentId: string | null;
  draftId: string | null;
}) {
  if (!assignmentId || !draftId) return;

  const { error } = await db
    .from("ai_prompt_assignments")
    .update({ ai_draft_id: draftId })
    .eq("id", assignmentId);

  if (error) {
    console.warn("[prompt-experiments] assignment draft link failed:", error.message);
  }
}
