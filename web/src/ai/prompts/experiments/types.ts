import type { createClient } from "@/lib/supabase/server";
import type { PromptConfig } from "@/ai/types";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PromptExperimentRow = {
  id: string;
  org_id: string;
  name: string;
  status: "draft" | "running" | "paused" | "rolled_back" | "completed";
  traffic_seed: string;
  stable_version_key: string;
  rollback_version_key: string;
};

export type PromptVariantRow = {
  id: string;
  org_id: string;
  experiment_id: string;
  prompt_version_key: string;
  allocation_percent: number;
  is_control: boolean;
  config_json: unknown;
};

export type PromptVersionRow = {
  version_key: string;
  config_json: unknown;
};

export type PromptAssignment = {
  assignmentId: string | null;
  experimentId: string | null;
  promptVersion: string;
  promptConfig: PromptConfig;
  assignmentKey: string;
  bucket: number | null;
  reason: "experiment" | "sticky_assignment" | "stable_fallback" | "rolled_back";
};

