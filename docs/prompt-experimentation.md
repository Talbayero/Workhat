# Prompt Experimentation

Work Hat's prompt experimentation framework is built for controlled rollout, not random behavior. It sits in front of draft generation and chooses a prompt version deterministically before the provider call.

## Experiment Model

Tables:

- `ai_prompt_versions`: org-scoped version keys and optional prompt config.
- `ai_prompt_experiments`: rollout state, stable version, rollback version, and deterministic traffic seed.
- `ai_prompt_experiment_variants`: weighted variants for one experiment.
- `ai_prompt_assignments`: sticky, auditable assignment of a conversation to a prompt version.

Prompt configs are intentionally small:

- `systemAppend`: extra controlled system instruction
- `userAppend`: extra controlled user-prompt instruction
- `temperature`: optional provider temperature override from 0 to 1

The base prompt layers and structured JSON output schema stay in code.

## Assignment Logic

`assignPromptVersion()` runs during `POST /api/ai/draft`:

1. Load the latest running experiment for the org.
2. Reuse an existing assignment for the conversation when one exists.
3. Otherwise compute a stable bucket from `org_id`, `experiment_id`, `traffic_seed`, and `conversation_id`.
4. Pick the first variant whose cumulative allocation contains the bucket.
5. Persist the assignment before generation.
6. Link the assignment to the persisted `ai_drafts` row after generation.

If no experiment is running, Work Hat falls back to the stable `PROMPT_VERSION`. If the latest experiment is `rolled_back`, Work Hat immediately uses `rollback_version_key`.

## Persistence Strategy

`ai_drafts.prompt_version` remains the source for outcome analytics. `ai_prompt_assignments` adds auditability:

- which experiment was active
- which conversation was assigned
- which bucket was used
- why the version was selected
- which draft resulted from that assignment

Assignment is sticky per conversation and experiment, so regenerating a draft for the same conversation does not jump variants.

## Analytics Integration

The AI Improvement Engine already compares outcomes by `prompt_version`:

- acceptance rate
- average edit distance
- average change percent
- full rewrite rate
- edit category distribution

Prompt experiments feed those metrics by ensuring each generated draft has the assigned version stored in `ai_drafts.prompt_version`.

## Rollback

Rollback is intentionally simple:

- set an experiment to `rolled_back`
- optionally set `rollback_version_key`
- new draft generations immediately use the rollback version
- historical assignments and draft outcomes remain intact for analysis

The management API is:

- `GET /api/ai/prompt-experiments`
- `PATCH /api/ai/prompt-experiments/:experimentId`

`PATCH` accepts `status` and optional `rollback_version_key`.

## Operator Runbook

To launch an experiment:

1. Create or verify the prompt versions in `ai_prompt_versions`.
2. Create one `ai_prompt_experiments` row with `status = 'draft'`, a stable version, and a rollback version.
3. Add variants in `ai_prompt_experiment_variants`; allocations should total no more than 100.
4. Set the experiment to `running`.
5. Monitor the dashboard's AI Improvement Engine by `prompt_version`.

To pause new assignments without losing history, set `status = 'paused'`. Existing `ai_prompt_assignments` remain as audit history.

To roll back quickly:

```json
{
  "status": "rolled_back",
  "rollback_version_key": "v1.0"
}
```

Send that payload to `PATCH /api/ai/prompt-experiments/:experimentId`. New drafts route to the rollback version immediately. Existing drafts, replies, and edit analyses are not rewritten.

## Example Experiment Rows

```sql
insert into ai_prompt_versions (org_id, version_key, label, status, config_json)
values
  (:org_id, 'v1.1-concise', 'Concise draft strategy', 'active', '{"userAppend":"Prefer a shorter reply with one clear next step."}'::jsonb)
on conflict (org_id, version_key) do nothing;

insert into ai_prompt_experiments (org_id, name, status, stable_version_key, rollback_version_key)
values (:org_id, 'Concise response trial', 'draft', 'v1.0', 'v1.0')
returning id;

insert into ai_prompt_experiment_variants (org_id, experiment_id, prompt_version_key, allocation_percent, is_control)
values
  (:org_id, :experiment_id, 'v1.0', 80, true),
  (:org_id, :experiment_id, 'v1.1-concise', 20, false);
```

Set the experiment to `running` only after checking the allocation and rollback version.

## Safeguards

- Human approval remains required before any draft is sent.
- Assignment is deterministic and persisted.
- Experiments are org-scoped by schema and RLS.
- Only `ai.configure` or `settings.manage` users can manage experiments.
- The provider abstraction still owns the model call.
- No ML bandit, automatic winner promotion, or automatic prompt mutation exists in V1.
