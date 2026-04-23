# Data Integrity Testing

This file consolidates the data integrity and state-machine testing strategy.

## Scope

The integration tests under `web/src/__tests__/integration/` cover:

- Conversation state transitions.
- Message cascade and cleanup behavior.
- Denormalized conversation fields.
- Database constraints and enum validation.
- Referential integrity.
- Concurrent operations.
- JSONB and nullable field edge cases.

## Conversation State Coverage

Current tests exercise operational transitions such as:

- `open` to `closed`
- `open` to `waiting_on_customer`
- `open` to `waiting_on_internal`
- `waiting_on_customer` back to `open`
- `waiting_on_internal` to `closed`
- status preservation during unrelated field updates

These tests are useful SOC 2 processing-integrity evidence because they show operational state is not only a UI convention.

## Cascade And Referential Coverage

The strategy validates expected relationship behavior:

- Conversation deletion removes related messages.
- Contact/company deletion does not orphan invalid references.
- Message ordering is stable by `created_at`.
- Org consistency is preserved across related records.

## Constraint Coverage

Tests should cover:

- Agent messages require `sender_user_id`.
- Message `direction` values remain valid.
- Conversation `status` values remain valid.
- Optional fields accept null where intended.
- Tags remain valid JSON arrays.

## Running Tests

Default unit tests:

```bash
cd web
npm test -- --runInBand
```

Integration tests:

```bash
cd web
npm run test:integration
```

Integration tests may require Supabase environment variables and service-role credentials, depending on the test file. Do not run live-data tests against production.

## Evidence Notes

For SOC 2 Type 2 readiness, record recurring test execution through CI logs or release evidence. A green local run is useful during development, but operating effectiveness needs dated evidence from the control period.

