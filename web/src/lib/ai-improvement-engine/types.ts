import type { EditTypeKey } from "@/lib/supabase/queries";

export type ImprovementEditRow = {
  id: string;
  conversation_id: string;
  ai_draft_id: string;
  edit_distance_score: number | string | null;
  change_percent: number | string | null;
  categories: unknown;
  likely_reason_summary: string | null;
  created_at: string;
  ai_drafts?: {
    prompt_version: string | null;
    missing_context?: unknown;
    recommended_tags?: unknown;
  } | null;
  conversations?: {
    intent: string | null;
    subject: string | null;
  } | null;
};

export type ImprovementKnowledgeEntry = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  category: string | null;
  tags: unknown;
  used_in_drafts: number | null;
  last_updated: string | null;
};

export type PromptVersionMetric = {
  promptVersion: string;
  evaluatedDrafts: number;
  acceptanceRate: number;
  avgEditDistance: number;
  avgChangePercent: number;
  fullRewriteRate: number;
  categoryDistribution: Record<EditTypeKey, number>;
  topCategory: EditTypeKey | null;
  sampleAnalysisIds: string[];
};

export type EditPatternCluster = {
  id: string;
  label: string;
  category: EditTypeKey | "other";
  count: number;
  avgChangePercent: number;
  avgEditDistance: number;
  promptVersions: string[];
  intents: string[];
  sampleReasons: string[];
  sampleAnalysisIds: string[];
};

export type KnowledgeGapInsight = {
  id: string;
  title: string;
  reason: string;
  count: number;
  avgChangePercent: number;
  categories: (EditTypeKey | "other")[];
  promptVersions: string[];
  evidenceAnalysisIds: string[];
  sampleReasons: string[];
};

export type KnowledgeEntryRecommendation = {
  entryId: string;
  title: string;
  category: string;
  reason: string;
  score: number;
  matchedPatterns: string[];
  evidenceAnalysisIds: string[];
  lastUpdated: string | null;
};

export type AiImprovementInsights = {
  promptVersions: PromptVersionMetric[];
  editPatterns: EditPatternCluster[];
  knowledgeGaps: KnowledgeGapInsight[];
  knowledgeRecommendations: KnowledgeEntryRecommendation[];
};
