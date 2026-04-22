# Workflow Engine

Work Hat V2 adds a lightweight event and rules engine so the CRM can react to operational conditions without becoming a visual BPM product.

The engine is intentionally small:

- rules live in Postgres
- events are emitted by domain code
- conditions are deterministic JSON comparisons
- actions are a fixed allowlist implemented in TypeScript
- every evaluation and action is written to execution tables
- rule actions do not recursively emit new workflow events in V2

---

## Schema

### `workflow_events`

Operational events consumed by rules. This is not the compliance audit log.

Important columns:

| Column | Purpose |
|---|---|
| `org_id` | tenant boundary |
| `event_type` | one of `conversation.created`, `message.received`, `draft.generated`, `reply.sent`, `conversation.updated`, `risk.changed`, `sla.breached` |
| `aggregate_type` / `aggregate_id` | primary resource for the event |
| `conversation_id` | optional fast-path for conversation-scoped rules |
| `actor_id` | app user responsible for the event, when applicable |
| `source` | emitting code path |
| `depth` / `correlation_id` / `caused_by_event_id` | loop and trace metadata |
| `payload_json` | bounded event-specific context |

### `workflow_rules`

Org-scoped rules. Rules can be enabled or disabled without deleting them.

Important columns:

| Column | Purpose |
|---|---|
| `event_type` | event that triggers the rule |
| `enabled` | disabled rules are ignored |
| `priority` | lower numbers run first |
| `conditions_json` | deterministic match rules |
| `actions_json` | ordered action list |
| `max_actions_per_run` | cap per rule execution |

Condition format:

```json
{
  "all": [
    { "path": "conversation.risk_level", "op": "eq", "value": "red" }
  ],
  "any": [
    { "path": "payload.intent", "op": "in", "value": ["billing", "escalation"] }
  ],
  "none": [
    { "path": "conversation.tags", "op": "contains", "value": "vip-handled" }
  ]
}
```

Supported operators: `eq`, `neq`, `in`, `not_in`, `contains`, `exists`, `gt`, `gte`, `lt`, `lte`.

Action format:

```json
[
  { "type": "apply_tag", "config": { "tag": "needs-manager-review" } },
  { "type": "change_priority", "config": { "priority": "urgent" } },
  { "type": "notify_manager", "config": { "title": "High-risk conversation", "body": "Review this thread." } }
]
```

Supported actions:

| Action | Effect |
|---|---|
| `assign_conversation` | updates `assigned_user_id` and/or `assigned_to_name` |
| `apply_tag` | appends a conversation tag if absent |
| `change_priority` | sets `low`, `normal`, `high`, or `urgent` |
| `change_risk` | sets `green`, `yellow`, or `red` |
| `create_qa_follow_up` | creates an open `qa_follow_ups` task |
| `notify_manager` | queues a `workflow_notifications` row |
| `flag_knowledge_gap_candidate` | creates a `knowledge_gap_candidates` row |

### Execution Tables

`workflow_rule_executions` stores one evaluation per event/rule pair, including skipped rules.

`workflow_action_executions` stores one row per attempted action, including skipped and failed actions.

These tables make execution auditable without overloading `audit_logs`, which remains the compliance/security log.

---

## Execution Model

1. Domain code calls `emitWorkflowEvent()` after a meaningful operation.
2. The event is inserted into `workflow_events`.
3. Enabled rules matching `org_id + event_type` are loaded by priority.
4. Each rule is evaluated against:
   - `event.*`
   - `payload.*`
   - `conversation.*` when a `conversation_id` is present
5. If conditions do not match, a skipped execution is recorded.
6. If conditions match, actions run in order up to `max_actions_per_run`.
7. Each action writes an action execution record with status and output.

Most route handlers emit events from `after()` so the user-facing response is not blocked by rule work.

---

## Safeguards

- Rules are org-scoped and evaluated with explicit `org_id` filters.
- Rule actions are a TypeScript allowlist; arbitrary code, SQL, webhooks, and AI calls are not supported.
- Conditions are deterministic comparisons only.
- Disabled rules are ignored.
- `max_actions_per_run` caps action fan-out.
- `workflow_rule_executions` has a unique `(event_id, rule_id)` constraint.
- Engine depth is capped at 3 in application code and 10 at the DB constraint level.
- V2 rule actions do not emit new workflow events. This deliberately prevents recursive automation loops.
- Idempotent actions skip no-op changes, such as re-applying an existing tag or setting the same risk.
- System artifacts are inserted by the service-role client; direct user writes are blocked by RLS.

---

## Event Emission Strategy

Current emitters:

| Event | Emitted From |
|---|---|
| `conversation.created` | manual conversation API, Postmark inbound, Gmail importer |
| `message.received` | manual opening message, Postmark inbound, Gmail importer |
| `draft.generated` | AI draft route |
| `reply.sent` | reply send route |
| `conversation.updated` | conversation PATCH, inbound append/update paths |
| `risk.changed` | inbound/Gmail escalations from non-red to red |
| `sla.breached` | schema-supported; scheduler/emitter to be added when SLA tracking lands |

Rule-created changes are intentionally not event emitters in V2. If a future feature needs chained workflows, add explicit domain emitters with depth/correlation handling rather than letting every action recursively trigger rules.

---

## Files

Implementation:

- `supabase/migrations/0031_workflow_engine.sql`
- `web/src/lib/workflow-engine/types.ts`
- `web/src/lib/workflow-engine/conditions.ts`
- `web/src/lib/workflow-engine/actions.ts`
- `web/src/lib/workflow-engine/engine.ts`
- `web/src/lib/workflow-engine/index.ts`

Event emitters:

- `web/src/app/api/conversations/route.ts`
- `web/src/app/api/conversations/[conversationId]/route.ts`
- `web/src/app/api/conversations/[conversationId]/reply/route.ts`
- `web/src/app/api/ai/draft/route.ts`
- `web/src/app/api/inbound/email/route.ts`
- `web/src/lib/email-connector/gmail-importer.ts`

