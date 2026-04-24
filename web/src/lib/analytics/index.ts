/**
 * Analytics entrypoint.
 * Import dashboard and reporting helpers from here instead of the legacy
 * `lib/supabase/queries` aggregation file.
 */

export type {
  AiImprovementInsights,
  DashboardStats,
  EditLogEntry,
  EditTypeKey,
  IntentStat,
  KnowledgeHealthPattern,
  PromptVersionMetric,
  EditPatternCluster,
  KnowledgeEntryRecommendation,
  KnowledgeGapInsight,
} from "@/lib/supabase/queries";

export {
  getAiImprovementInsights,
  getDashboardStats,
  getIntentStats,
  getKnowledgeHealth,
  getQAQueueFromDB,
  getRecentEditLog,
} from "@/lib/supabase/queries";
