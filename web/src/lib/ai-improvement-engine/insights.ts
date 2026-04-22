import type { EditTypeKey } from "@/lib/supabase/queries";
import type {
  AiImprovementInsights,
  EditPatternCluster,
  ImprovementEditRow,
  ImprovementKnowledgeEntry,
  KnowledgeEntryRecommendation,
  KnowledgeGapInsight,
  PromptVersionMetric,
} from "@/lib/ai-improvement-engine/types";

const EDIT_KEYS: EditTypeKey[] = [
  "accepted",
  "tone",
  "policy",
  "missing_context",
  "factual",
  "structure",
  "full_rewrite",
];

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "agent",
  "because",
  "before",
  "could",
  "customer",
  "draft",
  "from",
  "have",
  "into",
  "more",
  "need",
  "needs",
  "reply",
  "should",
  "that",
  "their",
  "there",
  "this",
  "with",
  "would",
]);

function toNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function toCategories(value: unknown): EditTypeKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((category): category is EditTypeKey =>
    EDIT_KEYS.includes(category as EditTypeKey)
  );
}

function firstNonAccepted(categories: EditTypeKey[], changePercent: number): EditTypeKey | "other" | "accepted" {
  if (changePercent < 10 || categories.includes("accepted")) return "accepted";
  return categories.find((category) => category !== "accepted") ?? "other";
}

function tokenise(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function signatureFor(row: ImprovementEditRow, category: string) {
  const reasonTokens = tokenise(row.likely_reason_summary ?? "");
  const intent = row.conversations?.intent?.trim().toLowerCase();
  const tokens = reasonTokens.slice(0, 4);
  if (tokens.length === 0 && intent) tokens.push(intent);
  if (tokens.length === 0) tokens.push("unclear");
  return `${category}:${tokens.sort().join("-")}`;
}

function labelFromReasons(reasons: string[], fallback: string) {
  const first = reasons.find(Boolean);
  if (!first) return fallback;
  return first.length > 84 ? `${first.slice(0, 81)}...` : first;
}

function emptyDistribution(): Record<EditTypeKey, number> {
  return Object.fromEntries(EDIT_KEYS.map((key) => [key, 0])) as Record<EditTypeKey, number>;
}

function topCategory(distribution: Record<EditTypeKey, number>) {
  return (Object.entries(distribution) as [EditTypeKey, number][])
    .filter(([key]) => key !== "accepted")
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
}

function buildPromptVersionMetrics(rows: ImprovementEditRow[]): PromptVersionMetric[] {
  const grouped = new Map<string, {
    count: number;
    accepted: number;
    fullRewrite: number;
    editDistance: number;
    changePercent: number;
    distribution: Record<EditTypeKey, number>;
    samples: string[];
  }>();

  for (const row of rows) {
    const promptVersion = row.ai_drafts?.prompt_version?.trim() || "unknown";
    const changePercent = toNumber(row.change_percent);
    const editDistance = toNumber(row.edit_distance_score);
    const categories = toCategories(row.categories);
    const bucket = grouped.get(promptVersion) ?? {
      count: 0,
      accepted: 0,
      fullRewrite: 0,
      editDistance: 0,
      changePercent: 0,
      distribution: emptyDistribution(),
      samples: [],
    };

    bucket.count += 1;
    bucket.editDistance += editDistance;
    bucket.changePercent += changePercent;
    if (changePercent < 10 || categories.includes("accepted")) bucket.accepted += 1;
    if (categories.includes("full_rewrite") || changePercent >= 80) bucket.fullRewrite += 1;
    for (const category of categories.length > 0 ? categories : ["structure" as EditTypeKey]) {
      bucket.distribution[category] += 1;
    }
    if (bucket.samples.length < 4) bucket.samples.push(row.id);

    grouped.set(promptVersion, bucket);
  }

  return [...grouped.entries()]
    .map(([promptVersion, value]) => ({
      promptVersion,
      evaluatedDrafts: value.count,
      acceptanceRate: Math.round((value.accepted / value.count) * 100),
      avgEditDistance: Number((value.editDistance / value.count).toFixed(2)),
      avgChangePercent: Math.round(value.changePercent / value.count),
      fullRewriteRate: Math.round((value.fullRewrite / value.count) * 100),
      categoryDistribution: value.distribution,
      topCategory: topCategory(value.distribution),
      sampleAnalysisIds: value.samples,
    }))
    .sort((a, b) => b.evaluatedDrafts - a.evaluatedDrafts || b.avgChangePercent - a.avgChangePercent);
}

function buildEditPatternClusters(rows: ImprovementEditRow[], limit: number): EditPatternCluster[] {
  const grouped = new Map<string, {
    category: EditTypeKey | "other";
    count: number;
    changePercent: number;
    editDistance: number;
    promptVersions: Set<string>;
    intents: Set<string>;
    reasons: string[];
    samples: string[];
  }>();

  for (const row of rows) {
    const changePercent = toNumber(row.change_percent);
    const categories = toCategories(row.categories);
    const category = firstNonAccepted(categories, changePercent);
    if (category === "accepted") continue;

    const key = signatureFor(row, category);
    const bucket = grouped.get(key) ?? {
      category,
      count: 0,
      changePercent: 0,
      editDistance: 0,
      promptVersions: new Set<string>(),
      intents: new Set<string>(),
      reasons: [],
      samples: [],
    };

    bucket.count += 1;
    bucket.changePercent += changePercent;
    bucket.editDistance += toNumber(row.edit_distance_score);
    bucket.promptVersions.add(row.ai_drafts?.prompt_version?.trim() || "unknown");
    const intent = row.conversations?.intent?.trim();
    if (intent) bucket.intents.add(intent);
    const reason = row.likely_reason_summary?.trim();
    if (reason && bucket.reasons.length < 4 && !bucket.reasons.includes(reason)) bucket.reasons.push(reason);
    if (bucket.samples.length < 6) bucket.samples.push(row.id);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .filter(([, value]) => value.count >= 2)
    .map(([id, value]) => ({
      id,
      label: labelFromReasons(value.reasons, `${value.category.replace(/_/g, " ")} edits`),
      category: value.category,
      count: value.count,
      avgChangePercent: Math.round(value.changePercent / value.count),
      avgEditDistance: Number((value.editDistance / value.count).toFixed(2)),
      promptVersions: [...value.promptVersions].sort(),
      intents: [...value.intents].sort(),
      sampleReasons: value.reasons,
      sampleAnalysisIds: value.samples,
    }))
    .sort((a, b) => b.count - a.count || b.avgChangePercent - a.avgChangePercent)
    .slice(0, limit);
}

function buildKnowledgeGaps(patterns: EditPatternCluster[], limit: number): KnowledgeGapInsight[] {
  return patterns
    .filter((pattern) =>
      pattern.category === "missing_context" ||
      pattern.category === "policy" ||
      pattern.category === "factual" ||
      pattern.avgChangePercent >= 45
    )
    .map((pattern) => ({
      id: `gap:${pattern.id}`,
      title: pattern.category === "missing_context"
        ? "Missing operational context"
        : pattern.category === "policy"
          ? "Policy guidance needs tightening"
          : pattern.category === "factual"
            ? "Factual correction pattern"
            : "High-edit repeated correction",
      reason: pattern.label,
      count: pattern.count,
      avgChangePercent: pattern.avgChangePercent,
      categories: [pattern.category],
      promptVersions: pattern.promptVersions,
      evidenceAnalysisIds: pattern.sampleAnalysisIds,
      sampleReasons: pattern.sampleReasons,
    }))
    .slice(0, limit);
}

function tagsToText(tags: unknown) {
  if (!Array.isArray(tags)) return "";
  return tags.filter((tag): tag is string => typeof tag === "string").join(" ");
}

function overlapScore(pattern: EditPatternCluster, entry: ImprovementKnowledgeEntry) {
  const patternText = `${pattern.label} ${pattern.sampleReasons.join(" ")} ${pattern.intents.join(" ")}`;
  const entryText = `${entry.title} ${entry.summary ?? ""} ${entry.body ?? ""} ${entry.category ?? ""} ${tagsToText(entry.tags)}`;
  const patternTokens = new Set(tokenise(patternText));
  if (patternTokens.size === 0) return 0;

  const entryTokens = new Set(tokenise(entryText));
  let overlap = 0;
  for (const token of patternTokens) {
    if (entryTokens.has(token)) overlap += 1;
  }

  const categoryBoost =
    pattern.category === "policy" && entry.category === "policy" ? 2 :
    pattern.category === "tone" && entry.category === "tone" ? 2 :
    pattern.category === "missing_context" && ["faq", "sop"].includes(entry.category ?? "") ? 1 :
    0;

  return overlap + categoryBoost + Math.min(2, Math.floor((entry.used_in_drafts ?? 0) / 25));
}

function buildKnowledgeRecommendations({
  patterns,
  entries,
  limit,
}: {
  patterns: EditPatternCluster[];
  entries: ImprovementKnowledgeEntry[];
  limit: number;
}): KnowledgeEntryRecommendation[] {
  const recommendations = new Map<string, KnowledgeEntryRecommendation>();
  const actionablePatterns = patterns.filter((pattern) => pattern.category !== "tone" && pattern.category !== "structure");

  for (const entry of entries) {
    const matches = actionablePatterns
      .map((pattern) => ({ pattern, score: overlapScore(pattern, entry) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (matches.length === 0) continue;

    const score = matches.reduce((sum, match) => sum + match.score + match.pattern.count, 0);
    const top = matches[0]!.pattern;
    recommendations.set(entry.id, {
      entryId: entry.id,
      title: entry.title,
      category: entry.category ?? "knowledge",
      reason: `Matches repeated ${top.category.replace(/_/g, " ")} corrections: ${top.label}`,
      score,
      matchedPatterns: matches.map((match) => match.pattern.label),
      evidenceAnalysisIds: [...new Set(matches.flatMap((match) => match.pattern.sampleAnalysisIds))].slice(0, 8),
      lastUpdated: entry.last_updated,
    });
  }

  return [...recommendations.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildAiImprovementInsights({
  edits,
  knowledgeEntries,
  patternLimit = 6,
  gapLimit = 4,
  recommendationLimit = 4,
}: {
  edits: ImprovementEditRow[];
  knowledgeEntries: ImprovementKnowledgeEntry[];
  patternLimit?: number;
  gapLimit?: number;
  recommendationLimit?: number;
}): AiImprovementInsights {
  const promptVersions = buildPromptVersionMetrics(edits);
  const editPatterns = buildEditPatternClusters(edits, patternLimit);
  const knowledgeGaps = buildKnowledgeGaps(editPatterns, gapLimit);
  const knowledgeRecommendations = buildKnowledgeRecommendations({
    patterns: editPatterns,
    entries: knowledgeEntries,
    limit: recommendationLimit,
  });

  return {
    promptVersions,
    editPatterns,
    knowledgeGaps,
    knowledgeRecommendations,
  };
}
