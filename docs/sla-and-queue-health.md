# SLA Tracking and Queue Health

Work Hat's SLA layer is intentionally small: org policy rows define deterministic response targets, conversation rows store the current SLA snapshot, and queue views read those snapshots for fast operational filtering.

## Schema

`org_sla_policies` stores one policy per org:

- `enabled`
- `first_response_minutes`
- `next_response_minutes`
- `at_risk_threshold_minutes`
- `business_hours_json`

`conversations` stores the explainable snapshot:

- `first_response_due_at`
- `next_response_due_at`
- `sla_status`: `not_applicable`, `ok`, `at_risk`, `breached`
- `sla_target`: `first_response` or `next_response`
- `sla_due_at`
- `sla_breached_at`
- `sla_last_evaluated_at`
- `first_response_at`
- `last_customer_message_at`
- `last_agent_response_at`

Indexes cover active queue filters by org, SLA status, due time, status, and assignee.

## Computation

The evaluator lives in `web/src/lib/sla/`.

For active conversations:

1. First customer message starts the first-response SLA.
2. The first outbound agent message after that customer message clears first response.
3. The latest customer message starts next-response SLA when no later outbound agent message exists.
4. `at_risk` applies when the active due time is inside the org warning window.
5. `breached` applies when the active due time is in the past.
6. Resolved and archived conversations are `not_applicable`.

V2 uses calendar minutes. `business_hours_json` is stored now so a future business-hours evaluator can be added without changing the policy table.

## Execution Model

SLA refresh runs in two places:

- After inbound and outbound message writes, using `refreshConversationSla`.
- Hourly through `/api/sla/refresh`, which refreshes active conversations for enabled policies.

When a conversation transitions into `breached`, the SLA layer emits `sla.breached` into the workflow engine. This lets existing rules notify managers, create QA follow-ups, or tag conversations without making the SLA evaluator responsible for automation.

## Safeguards

- The evaluator is deterministic TypeScript, not AI.
- Queue reads use stored snapshots instead of scanning message history.
- The hourly refresh is bounded per org.
- Refresh writes are scoped by `org_id` and `conversation_id`.
- `sla.breached` only emits on transition from a non-breached state.
- Resolved and archived conversations are excluded from active SLA pressure.
- Policy management is protected by `settings.manage` and org-scoped RLS.

## Queue Health UI

`/queue` surfaces:

- Active queue size
- SLA at-risk count
- SLA breached count
- Unassigned count
- Backlog pressure
- Aging buckets: `< 1h`, `1-4h`, `4-24h`, `24h+`

The filtered queue supports:

- SLA state
- Risk level
- Assignee
- Status
- Channel
- Intent

The page is server-rendered with URL search parameters so filters are shareable and easy to audit during operations reviews.
