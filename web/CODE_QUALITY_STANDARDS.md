# Code Quality Standards and Best Practices

**Version:** 1.0  
**Date:** April 22, 2026  
**Status:** Active

---

## Overview

This document establishes code quality standards for the Work Hat CRM platform. All code contributions must meet these standards before deployment.

---

## TypeScript Configuration

### Strict Mode: ✅ ENABLED

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Type Checking
- **All files:** Must pass `npm run type-check` with no errors
- **No `any` types:** Except with explicit `// @ts-expect-error` comments
- **Generics preferred:** Use `<T>` over `unknown | any`
- **Branded types:** Use for IDs: `type UserId = string & { readonly __brand: "UserId" }`

### Best Practices

✅ **DO:**
```typescript
// Explicit types
const users: User[] = [];
const userId: string = "123";

// Generics with constraints
function cache<T extends { id: string }>(item: T): void {}

// Union types for options
type Status = "open" | "closed" | "pending";

// Branded types for IDs
type OrgId = string & { readonly __brand: "OrgId" };
```

❌ **DON'T:**
```typescript
// Implicit any
const users = []; // any[]
const result = fetchData(); // any

// Loose typing
function process(data: any) {}

// Non-specific unions
type Value = string | number | boolean | object;
```

---

## ESLint Configuration

### Rules: ✅ ENABLED

**Base Rules (from Next.js config):**
- Core Web Vitals
- TypeScript best practices
- React hooks rules
- Import sorting

### Additional Rules

```javascript
// Enforced rules
'no-console': ['warn', { allow: ['warn', 'error'] }],
'no-debugger': 'error',
'no-unused-vars': 'off', // TS handles this
'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
'@typescript-eslint/explicit-function-return-types': ['warn'],
'@typescript-eslint/no-explicit-any': ['error'],
'@typescript-eslint/no-floating-promises': ['error'],
```

### Running ESLint

```bash
# Check all files
npm run lint

# Check specific directory
npm run lint src/lib/auth

# Check specific file
npm run lint src/lib/auth/capabilities.ts

# Fix auto-fixable issues
npm run lint -- --fix
```

### Common Violations and Fixes

**Issue:** `Unsafe return type 'any'`
```typescript
// ❌ Before
export async function getUser(id: string) {
  return db.query(...);
}

// ✅ After
export async function getUser(id: string): Promise<User | null> {
  return db.query(...);
}
```

**Issue:** `Unexpected console statement`
```typescript
// ❌ Before
console.log("Debug info");

// ✅ After
if (process.env.DEBUG) {
  console.warn("Debug info"); // console.warn is allowed
}
```

---

## Test Coverage Requirements

### Coverage Thresholds

**Global Minimum:**
```json
{
  "branches": 50,
  "functions": 50,
  "lines": 50,
  "statements": 50
}
```

**Security Code (Higher Standard):**
```json
{
  "./src/lib/auth/": { "branches": 80, "functions": 80, "lines": 80, "statements": 80 },
  "./src/lib/security/": { "branches": 80, "functions": 80, "lines": 80, "statements": 80 }
}
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm test:coverage

# Run in watch mode (development)
npm run test:watch

# Run specific test file
npm test -- capabilities.test.ts

# Run with verbose output
npm test -- --verbose
```

### Coverage Report Format

```
--------------------------------|----------|----------|----------|----------|
File                            | % Stmts  | % Branch | % Funcs  | % Lines  |
--------------------------------|----------|----------|----------|----------|
All files                       |    75.5  |    71.2  |    78.9  |    75.8  |
 src/lib/auth/                  |    85.2  |    82.1  |    87.5  |    86.1  |
  capabilities.ts               |    90.1  |    88.5  |    92.3  |    90.8  |
  app-user.ts                   |    80.3  |    75.8  |    82.5  |    81.2  |
 src/lib/security/              |    82.4  |    79.5  |    84.2  |    83.1  |
  audit-logger.ts               |    85.0  |    82.0  |    87.5  |    86.0  |
```

---

## Code Style

### Naming Conventions

```typescript
// Files and directories
src/lib/auth/capabilities.ts        // lowercase, hyphenated
src/components/UserCard.tsx         // PascalCase

// Variables and functions
const userId = "123";               // camelCase
function hasCapability() {}         // camelCase

// Classes and types
class UserManager {}                // PascalCase
interface UserProfile {}            // PascalCase
type Status = "open" | "closed";    // PascalCase

// Constants
const MAX_RETRY_ATTEMPTS = 3;       // SCREAMING_SNAKE_CASE
const DEFAULT_TIMEOUT = 5000;       // SCREAMING_SNAKE_CASE

// Private fields
private _cache: Map<string, any>;   // Leading underscore
```

### Formatting

- **Indentation:** 2 spaces
- **Line length:** 100 characters preferred, 120 maximum
- **Semicolons:** Required
- **Quotes:** Double quotes for strings
- **Trailing commas:** In multi-line objects/arrays

### Import Organization

```typescript
// 1. External packages
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 2. Project utilities
import { getCurrentAppUser } from "@/lib/auth/app-user";
import { logAudit } from "@/lib/security/audit-logger";

// 3. Types
import type { CurrentAppUser } from "@/lib/auth/app-user";
import type { Capability } from "@/lib/auth/capabilities";
```

---

## Documentation Requirements

### Code Comments

✅ **DO write comments for:**
- Complex algorithms
- Non-obvious intent
- Business logic justifications
- Edge cases and gotchas

```typescript
// Calculate SLA breach time with business day offset
// Note: Holidays not included in this calculation (see ticket #1234)
function calculateSLADeadline(createdAt: Date): Date {
  const businessDays = 2;
  // ... calculation ...
}
```

❌ **DON'T write comments for:**
- Obvious code
- Variable names that explain themselves
- Every single line

```typescript
// ❌ Bad: Comment explains what code already says
const userId = "123"; // Set userId to string

// ✅ Good: Comment explains why
const userId = "123"; // Prefixed with org for multi-tenant isolation
```

### JSDoc for Public APIs

```typescript
/**
 * Check if user has the required capability.
 *
 * @param user - The authenticated user object
 * @param capability - The capability to check (e.g., "conversations.read")
 * @param label - Optional label for logging context
 * @param cache - Optional request-scoped cache for performance
 * @returns true if user has capability, false otherwise
 * @throws Error if admin client unavailable and no fallback
 *
 * @example
 * const canRead = await hasCapability(user, "conversations.read");
 * if (!canRead) return NextResponse.json({ error: "Denied" }, { status: 403 });
 */
export async function hasCapability(
  user: CurrentAppUser,
  capability: Capability,
  label?: string,
  cache?: RequestCache
): Promise<boolean>
```

---

## Performance Guidelines

### Database Queries

- ✅ Use request-scoped caching for repeated queries
- ✅ Verify indexes are used (EXPLAIN ANALYZE)
- ❌ Avoid N+1 query patterns
- ❌ Never lazy-load without pagination

```typescript
// ❌ Bad: N+1 query pattern
const users = await db.query("SELECT * FROM users");
for (const user of users) {
  user.capabilities = await db.query(
    "SELECT * FROM capabilities WHERE user_id = ?",
    user.id
  );
}

// ✅ Good: Single query with join
const users = await db.query(`
  SELECT u.*, c.* FROM users u
  LEFT JOIN capabilities c ON u.id = c.user_id
`);
```

### Error Handling

```typescript
// ✅ Good: Graceful degradation
const client = getAdminClientOrLogWarn("context");
if (!client) {
  return fallbackValue();
}

// ❌ Bad: Silently fails
try {
  const result = await operation();
} catch {
  // Ignored!
}
```

---

## Security Review Checklist

Before committing, verify:

- [ ] No hardcoded secrets or credentials
- [ ] No console.log statements in production code
- [ ] All user input validated and escaped
- [ ] Proper error handling (no stack traces in responses)
- [ ] Capability checks on protected endpoints
- [ ] Org ID isolation verified
- [ ] No SQL injection vulnerabilities
- [ ] Request body validation using schemas
- [ ] Rate limiting in place for sensitive operations
- [ ] Audit logging for security events

---

## Pre-Commit Checklist

Before running `git commit`:

```bash
# 1. Type checking
npm run type-check

# 2. Linting
npm run lint -- --fix  # Auto-fix issues

# 3. Tests
npm test -- --coverage

# 4. Manual review
# - Read your own code changes
# - Check for security issues
# - Verify test coverage
```

---

## Commit Message Standards

```
feat: add request-scoped caching (capitalized, imperative)

Detailed explanation of what and why. Keep under 72 characters for
title. This section can wrap to multiple lines.

- Bullet point 1
- Bullet point 2
- Bullet point 3

Closes #123
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

### Types
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code restructuring (no behavior change)
- `test:` Test additions/changes
- `docs:` Documentation
- `perf:` Performance improvement

---

## Continuous Integration

### Automated Checks (Future)

When CI is configured, these will run automatically:
- TypeScript compilation (type-check)
- ESLint checks
- Jest test suite
- Coverage validation
- Build verification

### Current Manual Process

```bash
# Before pushing:
npm run type-check && npm run lint && npm test:coverage && npm run build
```

---

## References

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **ESLint Rules:** https://eslint.org/docs/rules/
- **Jest Testing:** https://jestjs.io/docs/getting-started
- **Next.js Best Practices:** https://nextjs.org/docs/basic-features/best-practices

---

## Questions?

Refer to:
1. Code examples in this document
2. Existing code patterns in src/lib/
3. Test files in src/__tests__/
4. Team documentation in /docs

---

*Code Quality Standards v1.0 — April 22, 2026*
