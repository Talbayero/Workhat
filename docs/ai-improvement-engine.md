# AI Improvement Engine

The AI Improvement Engine turns stored draft and edit-analysis data into operational intelligence. V1 is deliberately deterministic and traceable: it aggregates existing records rather than introducing a black-box recommender.

## Data Sources

The engine reads org-scoped data from:

- `ai_drafts`: `prompt_version`, missing context, recommended tags, model metadata
- `edit_analyses`: edit distance, change percent, categories, likely reason summary
- `conversations`: intent and subject context
- `knowledge_entries`: active SOPs, policies, FAQs, tone guides, usage counts

No recommendation is generated without evidence from `edit_analyses.id` values.

## Query Design

`getAiImprovementInsights()` loads the last 90 days of edit analyses for the current org and joins each row to its AI draft and conversation. It also loads active knowledge entries for deterministic matching.

Supporting indexes:

- `edit_analyses_org_draft_created_idx`
- `edit_analyses_org_change_created_idx`
- `knowledge_entries_org_active_used_idx`

V1 computes insights at read time. A persisted snapshot table can be added later if large tenants need cached historical runs.

## Metrics

Prompt-version analytics include:

- evaluated draft count
- draft acceptance rate
- average edit distance
- average change percent
- full rewrite rate
- edit category distribution
- top non-accepted edit category
- sample edit-analysis IDs

Acceptance is deterministic: a draft is accepted when change percent is below 10 or the classifier includes `accepted`.

Full rewrite is deterministic: a draft is counted as full rewrite when the classifier includes `full_rewrite` or change percent is at least 80.

## Pattern Clustering

Repeated edit patterns are grouped by:

- primary non-accepted edit category
- normalized tokens from `likely_reason_summary`
- conversation intent fallback when no reason text exists

Clusters require at least two matching edits. Each cluster includes counts, average change percent, average edit distance, prompt versions, intents, sample reasons, and evidence edit-analysis IDs.

## Knowledge Gap Logic

Likely gaps are derived from repeated clusters when the category is:

- `missing_context`
- `policy`
- `factual`

High-edit clusters can also become gap candidates when average change percent is high. These are recommendations for operator review, not automatic knowledge changes.

## Knowledge Entry Recommendations

The engine recommends existing knowledge entries for review by scoring deterministic token overlap between repeated correction patterns and each active entry's title, summary, body, category, and tags. Scores are boosted slightly for category alignment and high usage in drafts.

Every recommendation includes matched pattern labels and evidence edit-analysis IDs so an operator can understand why the entry was flagged.

## UI Surface

The dashboard includes an "AI Improvement Engine" card with:

- prompt-version performance table
- repeated edit patterns
- likely knowledge gaps
- knowledge entries to review

This keeps the feature operator-friendly and close to the existing AI quality workflow.

## Operator Interpretation

Use the dashboard as a triage surface:

- Low acceptance rate for one `prompt_version` suggests the prompt strategy needs review before wider rollout.
- High full rewrite rate means agents are often discarding the draft instead of editing it.
- Repeated `missing_context`, `policy`, or `factual` clusters should become knowledge-base review work.
- Knowledge-entry recommendations are candidates for human review, not automatic edits.
- Evidence IDs are shown so operators can inspect the exact edit analyses behind a recommendation.

For prompt experiments, compare versions only after each version has enough evaluated drafts to avoid overreacting to a tiny sample.

## Safeguards

- All reads are scoped by `org_id`.
- Logic is deterministic TypeScript in `web/src/lib/ai-improvement-engine/`.
- No AI model is used to create the recommendation itself.
- Evidence IDs are shown in the UI for traceability.
- The system recommends review; it does not edit prompts or knowledge automatically.
