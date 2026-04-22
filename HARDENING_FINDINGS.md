# Work Hat CRM — Hardening & Janitorial Findings

**Generated:** April 22, 2026  
**Scope:** Auth edge cases, input validation, error handling, data integrity, E2E processes, test coverage, tech debt, documentation, code quality

---

## Executive Summary

Work Hat has a **strong security foundation** with recent hardening (April 2026):
- ✅ Capability-based authorization system (`lib/auth/capabilities.ts`)
- ✅ Immutable audit logging with 26 action types (`lib/security/audit-logger.ts`)
- ✅ API rate limiting (Upstash Redis)
- ✅ Input validation patterns (length caps, regex validation)
- ✅ Solid documentation foundation (`docs/` folder with architecture, conventions, decisions)

**Key gaps identified:**

1. **Auth & Capabilities Gaps:**
   - No edge-case test coverage for role transitions, orphaned users, override conflicts
   - Admin client fallback in `getMappedCapabilities()` silently falls back to role preset on DB failure
   - No concurrent write guards on capability overrides
   - No explicit org_id isolation checks in override lookups

2. **Input Validation Gaps:**
   - Email validation uses simple regex (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) — doesn't validate length or RFC compliance
   - No centralized schema validation library (each route has custom logic)
   - Missing validation on optional parameters in some routes
   - No limits on JSON payload depth/nesting

3. **Error Handling & Logging Gaps:**
   - No structured error logging for API failures
   - Audit logger swallows errors silently — no alerting on audit failures
   - Missing error context in some responses (info disclosure vs. clarity tradeoff not explicit)
   - No specific audit actions for auth failures or capability checks

4. **Data Integrity Gaps:**
   - No concurrent write tests (e.g., simultaneous capability overrides)
   - Soft-delete logic in knowledge_entries (is_active) not validated for cascade consistency
   - Data retention policies exist but no enforcement tests
   - No constraints on conversation state transitions

5. **E2E Process Gaps:**
   - No test suite for full workflows (email in → draft → audit trail → send)
   - No network failure/timeout recovery tests
   - Missing integration tests between subsystems (Gmail sync + workflow engine + audit)

6. **Test Coverage Gaps:**
   - **Zero tests in `web/src/` directory** — no unit or integration tests
   - Hardening code (auth, audit, validation) has no tests
   - No test fixtures or factories

7. **Tech Debt:**
   - Input validation logic duplicated across routes (normalizeOptionalString in 3+ places)
   - Admin client fallback pattern (`createOptionalAdminClient`) appears in 20+ places without consistent error handling
   - No validation middleware/decorator pattern
   - Audit action type list manually maintained in TS (should be generated from DB enum)

8. **Documentation Gaps:**
   - TECHNICAL.md marked deprecated — good!
   - Architecture.md covers auth/capabilities but missing recent details:
     - Capability override precedence rules
     - Admin client fallback strategy
     - Rate limiting configuration
     - Audit retention policy
   - No security runbook for on-call
   - No migration guide for new team members on auth checks
   - No incident response playbook

9. **Code Quality:**
   - No linting/type safety enforcement visible
   - `any` types in some middleware/admin client code
   - Missing null-safety guards in optional admin client checks

---

## Detailed Findings by Category

### 1. Auth & Capabilities Edge Cases

**Current State:**
- `capabilities.ts` implements clean separation: role preset → DB role_capabilities → user overrides
- Two async DB calls per auth check (performance concern)
- Fallback to role preset on DB error

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| Silent fallback | Admin client unavailable → silent fallback to role preset | HIGH |
| No cascade cleanup | Delete user → stale overrides remain | MEDIUM |
| No org_id isolation | Override lookup doesn't explicitly verify org_id | MEDIUM |
| Concurrent writes | Two simultaneous override grants → race condition? | MEDIUM |
| No audit on auth fail | requireCapability() doesn't log failed checks | LOW |
| Caching strategy unclear | No caching; every request = 2 DB hits | MEDIUM |

**Action Items:**
- [ ] Add test coverage for admin client failures
- [ ] Add explicit org_id filter to override queries
- [ ] Add audit log for capability check failures
- [ ] Document fallback strategy in architecture.md
- [ ] Add cache layer (in-request) to avoid duplicate lookups
- [ ] Add cascade cleanup trigger on user deletion

---

### 2. Input Validation & Sanitization

**Current State:**
- Good length caps on string inputs (200–2000 chars)
- Email validation with regex
- Array validation with type checks and deduplication
- Body type checks (reject non-objects, arrays)

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| Email validation weak | Regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` allows long strings, no RFC5321 | LOW |
| No max payload depth | No limit on JSON nesting depth | MEDIUM |
| No centralized schema | Each route has custom validation logic | MEDIUM |
| Optional param inconsistency | Some routes don't validate optional fields | MEDIUM |
| No rate-limit per user | API gateway has IP-based limits, no per-user action limits | MEDIUM |
| XSS in audit_label | Resource labels stored in audit_logs — no escaping in UI | LOW |

**Action Items:**
- [ ] Create Zod schemas for all request bodies
- [ ] Centralize validation in middleware or route handlers
- [ ] Add max payload depth check
- [ ] Add per-action rate limits (e.g., max N capability changes per min)
- [ ] Document email validation strategy
- [ ] Test edge cases (empty strings, whitespace, max lengths)

---

### 3. Error Handling & Logging

**Current State:**
- Consistent 40x/50x responses
- Audit logger swallows errors (console.error only)
- User-friendly error messages (no system internals leaked)

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| Audit failure silent | logAudit() never throws — admin client failure goes unnoticed | HIGH |
| No structured logs | console.error → stdout, no structured logging backend | MEDIUM |
| Missing context | Error responses don't include trace IDs or request IDs | MEDIUM |
| No auth fail audit | Failed capability checks not logged | MEDIUM |
| No SLA errors | Conversations/SLA failures not explicitly audited | LOW |

**Action Items:**
- [ ] Add alert mechanism for audit logger failures
- [ ] Add request ID generation and logging
- [ ] Create structured error log schema
- [ ] Add audit entries for auth failures
- [ ] Document error handling strategy
- [ ] Add integration with external logging (Sentry/DataDog)

---

### 4. Data Integrity & Edge Cases

**Current State:**
- Soft deletes on knowledge_entries (is_active flag)
- Data retention policies table defined
- Conversation state enums (open/closed/waiting_on_customer/waiting_on_internal)

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| No state machine | Conversation states can transition anywhere (no guards) | MEDIUM |
| Soft delete cascade | Delete knowledge_entry → stale references in knowledge_chunks? | MEDIUM |
| No retention tests | Policies defined but no test that old data is deleted | MEDIUM |
| No concurrent write tests | Simultaneous edits to same conversation | LOW |

**Action Items:**
- [ ] Add conversation state transition guards (enum in RLS policy)
- [ ] Add tests for retention policy enforcement
- [ ] Add cascade cleanup tests for soft-deleted knowledge
- [ ] Document state machine rules in conventions.md
- [ ] Add concurrency tests for high-contention resources

---

### 5. End-to-End Process Verification

**Current State:**
- Email inbound pipeline: Gmail Pub/Sub → API → DB
- Draft generation: Conversation → AI → audit
- Reply sending: Draft → approval → Gmail API → audit

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| No E2E tests | Full workflows untested | HIGH |
| Timeout handling | No tests for network/API timeouts | MEDIUM |
| Partial failures | Audit logged but email sent; email fails but audit succeeds? | MEDIUM |
| Gmail sync resilience | Watch renewal, token refresh, backoff strategy not tested | MEDIUM |

**Action Items:**
- [ ] Create E2E test suite (email in → draft → audit → reply → send)
- [ ] Add failure scenario tests (API down, timeout, partial failures)
- [ ] Add Gmail resilience tests (token refresh, watch renewal)
- [ ] Document recovery procedures in runbooks
- [ ] Add synthetic monitoring probes

---

### 6. Test Coverage & Gaps

**Current State:**
- **Zero production tests in web/src/**
- Hardening code untested (auth, audit, validation)
- No test fixtures, factories, or mocks

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| No regression protection | Code changes have no safety net | CRITICAL |
| Refactoring blocked | Impossible to refactor with confidence | CRITICAL |
| Onboarding risk | New contributors can't verify their changes | HIGH |

**Action Items:**
- [ ] Set up Jest + testing-library for unit/integration tests
- [ ] Create test fixtures for auth, org, user scenarios
- [ ] Write tests for all security-critical code (auth, audit, validation)
- [ ] Add CI/CD gate for test coverage (80%+ target)
- [ ] Document testing conventions in docs/conventions.md

---

### 7. Tech Debt

**Current State:**
- Clean separation of concerns overall
- Good module organization
- Audit logger is well-documented

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| Duped validation logic | normalizeOptionalString, normalizeTags in multiple files | MEDIUM |
| Admin client pattern spread | 20+ uses of `createOptionalAdminClient()` without consistent error handling | MEDIUM |
| Manual audit enum | AuditAction type in TS, actual enum in migration 0027 — sync manually | LOW |
| No validation middleware | Each route repeats JSON parse → type check → field validation | MEDIUM |

**Action Items:**
- [ ] Create `lib/validation/schemas.ts` with Zod schemas
- [ ] Create `lib/validation/middleware.ts` for common parsing
- [ ] Create `lib/api/request-context.ts` for request ID + logging
- [ ] Generate AuditAction type from DB enum (or vice versa)
- [ ] Consolidate admin client error handling

---

### 8. Documentation

**Current State:**
- Strong foundation: `docs/` folder with authoritative docs
- Architecture.md covers auth/capabilities at high level
- Conventions.md documents code style
- Decisions.md has ADRs

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| Hardening not documented | Capability overrides, admin fallback, audit retention not explained | MEDIUM |
| No security runbook | On-call engineer has no incident response guide | MEDIUM |
| Rate limiting opaque | Upstash config, rate-limit calculations not documented | LOW |
| No auth decision guide | When to use requireCapability vs hasCapability? | LOW |

**Action Items:**
- [ ] Create `docs/security-hardening.md` covering:
  - Capability system deep dive
  - Admin client fallback strategy
  - Audit retention and compliance
  - Rate limiting configuration
  - Incident response playbook
- [ ] Update architecture.md with rate limiting section
- [ ] Create `docs/on-call-runbook.md` for security incidents
- [ ] Create `docs/new-contributor-auth-guide.md`

---

### 9. Code Quality

**Current State:**
- TypeScript throughout
- Consistent naming conventions
- Clear function signatures

**Gaps & Risks:**

| Risk | Details | Priority |
|------|---------|----------|
| No linting visible | No ESLint/Prettier enforcement in CI | LOW |
| Any types present | Some middleware code may have implicit any | LOW |
| Null-safety inconsistent | Optional chaining patterns vary | LOW |
| Dead code unknown | No audit of unused functions/imports | LOW |

**Action Items:**
- [ ] Enable strict TypeScript checking in tsconfig.json
- [ ] Run ESLint with @typescript-eslint recommended rules
- [ ] Add pre-commit hook for linting
- [ ] Audit unused exports/imports
- [ ] Document TypeScript setup in conventions.md

---

## Priority Roadmap

### Phase 1: Critical (Blocks security/compliance)
1. Add audit failure alerting mechanism
2. Add org_id isolation verification in auth
3. Create comprehensive test suite

### Phase 2: High (Improves resilience)
4. Add capability override cascade cleanup
5. Add request ID / structured logging
6. Add E2E process tests
7. Create validation schema library

### Phase 3: Medium (Tech debt / quality)
8. Consolidate admin client error handling
9. Add caching to reduce DB calls
10. Create security runbook
11. Refactor validation logic

### Phase 4: Low (Nice to have)
12. Audit code for dead code
13. Enforce strict linting
14. Generate AuditAction from DB enum

---

## Success Criteria

- [ ] All hardening code has >80% test coverage
- [ ] All API routes have input validation tests
- [ ] E2E workflows have at least one happy + one failure scenario test
- [ ] Documentation updated with security runbooks
- [ ] Code quality checks pass (TypeScript strict, ESLint)
- [ ] All tasks in this document have action items and owners
