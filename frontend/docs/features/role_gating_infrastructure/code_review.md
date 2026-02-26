# Code Review — Role Gating Infrastructure

## 1) Summary & Decision

**Readiness**

The implementation is well-structured, faithful to the approved plan, and all verification gates pass: `pnpm check` exits cleanly (0 errors, 52 warnings -- all expected from the new ESLint rule flagging existing mutation hook imports that lack role constant co-imports), `vitest` reports 101 tests passing across 5 files, and TypeScript strict mode compiles without errors. The code follows existing project patterns closely (generator structure, ESLint rule shape, auth context consumption, test file layout). The only notable findings are minor: an inaccurate JSDoc comment, rule severity set to `warn` rather than the plan's `error`, and the Gate/usePermissions unit tests test extracted logic proxies rather than the actual components. None of these block shipping.

**Decision**

`GO-WITH-CONDITIONS` -- Ship after addressing the JSDoc accuracy issue (Minor) and confirming the intentional `warn` vs `error` severity choice for the ESLint rule.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan Section 1 (Generator script)` <-> `scripts/generate-api.js:471-561` -- `generateRoles(spec)` reads `x-auth-roles.read`, iterates `spec.paths`, filters by `requiredRole !== readRole`, derives constant names via `hookNameToRoleConstant`, writes `roles.ts` and `role-map.json`. Matches plan exactly.
- `Plan Section 1 (Constant naming)` <-> `scripts/generate-api.js:471-479` -- `hookNameToRoleConstant` strips `use`, lowercases first char, appends `Role`. Example: `useDeletePartsByPartKey` -> `deletePartsByPartKeyRole`. Matches plan.
- `Plan Section 2 (RequiredRole union)` <-> `scripts/generate-api.js:534-549` -- union built from `roleValues` Set, sorted alphabetically, falls back to `never` if empty. Matches plan.
- `Plan Section 2 (role-map.json)` <-> `scripts/generate-api.js:526-529` -- only mutation methods (POST/PUT/PATCH/DELETE) added to role map. Matches plan.
- `Plan Section 2 (Gate component)` <-> `src/components/auth/gate.tsx:1-53` -- accepts `requires: RequiredRole | RequiredRole[]`, optional `fallback`, performs `roles.some(role => hasRole(role))`. Matches plan.
- `Plan Section 2 (usePermissions hook)` <-> `src/hooks/use-permissions.ts:1-35` -- wraps `useAuthContext`, exposes `hasRole(role: RequiredRole): boolean`. Matches plan.
- `Plan Section 3 (ESLint rule)` <-> `scripts/eslint-rules/role-import-enforcement.js:1-120` -- reads `role-map.json`, tracks hook imports and role constant imports, reports on `Program:exit`. Matches plan's AST visitor pattern.
- `Plan Section 3 (ESLint config)` <-> `eslint.config.js:41-52` -- new config block scoped to `src/**/*.{ts,tsx}` with `role-gating` plugin namespace. Matches plan's config shape.
- `Plan Section 4 (vitest include expansion)` <-> `vitest.config.ts:11-14` -- include array extended to `['src/**/__tests__/**/*.test.{ts,tsx}', 'scripts/__tests__/**/*.test.ts']`. Matches plan; also correctly adds `{ts,tsx}` glob for the src pattern to pick up `.test.tsx` files.
- `Plan Section 4 (Generator integration)` <-> `scripts/generate-api.js:586` -- `generateRoles(spec)` called from `generateAPI()` after `generateHooks(spec)`. Matches plan.
- `Plan Section 4 (Exports for testing)` <-> `scripts/generate-api.js:613-619` -- `generateRoles`, `transformOperationId`, `capitalize`, `hookNameToRoleConstant` exported. Matches plan's test requirements.

**Gaps / deviations**

- `Plan Section 5 (ESLint rule error severity)` -- Plan specifies the rule config as `'role-gating/role-import-enforcement': 'error'` (`plan.md:119`), but the implementation uses `'warn'` (`eslint.config.js:50`). This means the rule will not block CI. This may be intentional as a soft-launch approach since 52 existing files would fail the check, but it deviates from the plan and should be confirmed as deliberate.
- `Plan Section 8 (Gate outside AuthProvider)` -- Plan states "If called outside AuthProvider (defensive), hasRole returns false" (`plan.md:276`). Implementation's JSDoc repeats this claim (`use-permissions.ts:22`), but `useAuthContext()` at line 27 throws `"useAuthContext must be used within AuthProvider"` (`auth-context.tsx:38`). The hook will throw, not return false. The plan's Section 8 also acknowledges this throw behavior (`plan.md:276-278`), so the implementation is actually correct -- the JSDoc is what needs fixing.

---

## 3) Correctness -- Findings (ranked)

- Title: `Minor -- Inaccurate JSDoc on usePermissions regarding outside-AuthProvider behavior`
- Evidence: `src/hooks/use-permissions.ts:22` -- "If called outside AuthProvider (defensive), hasRole always returns false." But `useAuthContext()` at line 27 throws `"useAuthContext must be used within AuthProvider"` per `src/contexts/auth-context.tsx:37-40`.
- Impact: A developer reading the JSDoc might expect graceful degradation and be surprised by the thrown error during development. In production the scenario never occurs because `AuthGate` ensures `AuthProvider` is always present, so this is documentation-only.
- Fix: Update the JSDoc to: "Throws if called outside AuthProvider. In practice, AuthGate prevents the app tree from rendering before auth resolves, so user is always non-null."
- Confidence: High

- Title: `Minor -- ESLint rule severity set to warn instead of plan-specified error`
- Evidence: `eslint.config.js:50` -- `'role-gating/role-import-enforcement': 'warn'`. Plan specifies `'error'` at `plan.md:119`.
- Impact: The rule produces 52 warnings across existing files that use mutation hooks without role constant imports. At `warn` severity these do not block `pnpm check`. This is likely an intentional soft-launch choice (the follow-up slice that wires `Gate` into UI pages would resolve these warnings), but it deviates from the plan and should be documented.
- Fix: Either (a) promote to `error` after the follow-up slice resolves the 52 existing violations, or (b) add a comment in `eslint.config.js` explaining the `warn` choice and when it should be promoted to `error`.
- Confidence: High

- Title: `Minor -- Gate and usePermissions unit tests test extracted logic proxies, not actual components`
- Evidence: `src/components/auth/__tests__/gate.test.tsx:39-46` defines a standalone `gateDecision()` function that duplicates Gate's logic. `src/hooks/__tests__/use-permissions.test.ts:20-23` defines a standalone `hasRole()` function. Neither test file renders the actual React components or calls the actual hooks.
- Impact: The tests verify the decision algorithm (which is correct and trivial) but do not exercise the actual React integration (context consumption, prop handling). A regression in how `Gate` consumes `usePermissions` or how `usePermissions` reads from `useAuthContext` would not be caught. This is explicitly acknowledged in the test file comments and deferred to Playwright integration tests.
- Fix: No immediate fix required. When a React testing library (e.g., `@testing-library/react`) is added to the project, or when the follow-up slice adds Playwright specs for Gate, these tests should be supplemented with component-level rendering tests.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: Duplicated authorization logic across test files
- Evidence: `src/components/auth/__tests__/gate.test.tsx:39-46` and `src/hooks/__tests__/use-permissions.test.ts:63-69` both define nearly identical `gateDecision`/`isAuthorized` functions. Additionally, `src/hooks/__tests__/use-permissions.test.ts:20-23` defines `hasRole` which duplicates gate.test.tsx territory.
- Suggested refactor: The `use-permissions.test.ts` file already tests both `hasRole` and `isAuthorized` (the Gate logic). The overlapping `gateDecision` tests in `gate.test.tsx:52-95` could be removed to consolidate coverage in one place, with `gate.test.tsx` retaining only the module-export smoke tests (lines 21-29).
- Payoff: Eliminates test duplication and reduces the chance that a logic change requires updating two test files. Both files currently test the same pure function independently.

No other over-engineering observed. The abstractions are thin and well-scoped.

---

## 5) Style & Consistency

- Pattern: ESLint rule uses ESM `import` syntax while the existing `no-route-mocks` rule uses bare declarations (no explicit import/export keywords but relies on `export default`)
- Evidence: `scripts/eslint-rules/role-import-enforcement.js:13-14` uses `import { readFileSync } from 'fs'; import path from 'path';`. The existing `scripts/eslint-rules/testing/no-route-mocks.js:1-3` uses bare `const` declarations at module top level with `export default` at the end.
- Impact: Both files use `export default` which works in the ESM context. The new rule uses explicit `import` statements which is arguably cleaner and consistent with the rest of the project's ESM usage. This is not a problem -- it's actually a slight improvement.
- Recommendation: No change needed. If the team standardizes, the older rule could be updated to match the new one.

- Pattern: Generated file header comment format
- Evidence: `scripts/generate-api.js:537` writes `// Generated role constants - do not edit manually` while existing generated files use `// Generated API client - do not edit manually` (`generate-api.js:57`) and `// Generated TanStack Query hooks - do not edit manually` (`generate-api.js:119`). The pattern is consistent.
- Impact: None -- all generated files carry a clear "do not edit manually" warning.
- Recommendation: No change needed.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Generator script (`generateRoles`, `hookNameToRoleConstant`, `transformOperationId`)
- Scenarios:
  - Given a spec with reader/editor endpoints, When `generateRoles` runs, Then `roles.ts` contains only editor constants and `role-map.json` contains only mutation hooks (`scripts/__tests__/generate-roles.test.ts:89-104`)
  - Given a spec with only reader endpoints, When `generateRoles` runs, Then no constants are generated (`scripts/__tests__/generate-roles.test.ts:141-152`)
  - Given a spec without `x-required-role`, When `generateRoles` runs, Then the endpoint is skipped (`scripts/__tests__/generate-roles.test.ts:127-139`)
  - Given a spec with multiple distinct role values, When `generateRoles` runs, Then `RequiredRole` union includes all values sorted (`scripts/__tests__/generate-roles.test.ts:154-172`)
  - Given a spec without `x-auth-roles.read`, When `generateRoles` runs, Then generation is skipped entirely (`scripts/__tests__/generate-roles.test.ts:174-188`)
  - Given unsorted endpoints, When `generateRoles` runs, Then constants are alphabetically ordered (`scripts/__tests__/generate-roles.test.ts:190-206`)
- Hooks: `writeFileSync` is mocked via `vi.mock('fs')` to capture output without disk writes.
- Gaps: No test verifies behavior when an endpoint has an `operationId` but the `operationId` format is unexpected (e.g., missing `__api` segment). This is low-risk since the existing `transformOperationId` handles this robustly.
- Evidence: `scripts/__tests__/generate-roles.test.ts:1-207`

- Surface: ESLint rule (`role-import-enforcement`)
- Scenarios:
  - Given a file importing a mutation hook with its role constant, When linted, Then no error (`scripts/__tests__/role-import-enforcement.test.ts:50-56`)
  - Given a file importing a query hook without a role constant, When linted, Then no error (`scripts/__tests__/role-import-enforcement.test.ts:58-62`)
  - Given a file importing a mutation hook without its role constant, When linted, Then error reported (`scripts/__tests__/role-import-enforcement.test.ts:90-98`)
  - Given a file importing a role constant from the wrong module, When linted, Then error reported (`scripts/__tests__/role-import-enforcement.test.ts:110-117`)
  - Given multiple mutation hooks missing role constants, When linted, Then all are reported (`scripts/__tests__/role-import-enforcement.test.ts:119-124`)
  - Given relative import paths, When linted, Then suffix matching works correctly (`scripts/__tests__/role-import-enforcement.test.ts:80-87`)
- Hooks: `fs.readFileSync` is mocked via `vi.mock('fs')` to provide a controlled role map without needing the generated file.
- Gaps: No test for re-exported or aliased imports (e.g., `import { useDeletePartsByPartKey as deleteParts }`). The rule uses `specifier.imported.name` which correctly reads the original name even when aliased, so this is covered by the implementation but not by a test.
- Evidence: `scripts/__tests__/role-import-enforcement.test.ts:1-126`

- Surface: Gate component and usePermissions hook
- Scenarios:
  - Decision logic tested via extracted functions covering: single role match, single role miss, array any-of semantics, empty roles, null roles (`src/components/auth/__tests__/gate.test.tsx:52-95`, `src/hooks/__tests__/use-permissions.test.ts:29-95`)
  - Module export smoke tests verify `Gate` is a function and `usePermissions` is a function (`src/components/auth/__tests__/gate.test.tsx:21-29`)
- Hooks: No React rendering; pure function tests.
- Gaps: No component rendering tests (acknowledged in test comments). No Playwright specs (correctly deferred per plan scope -- Gate is not wired into any pages yet).
- Evidence: `src/components/auth/__tests__/gate.test.tsx:1-95`, `src/hooks/__tests__/use-permissions.test.ts:1-95`

---

## 7) Adversarial Sweep (must attempt >=3 credible failures or justify none)

- Checks attempted:
  1. Stale closure in `hasRole` callback
  2. `loadRoleMap` crash when `role-map.json` is missing during lint
  3. Race between role-map.json generation and ESLint rule execution
  4. Generator producing duplicate constants for the same endpoint
  5. Performance: `loadRoleMap` called per-file vs per-run

- Evidence and why code held up:

  1. **Stale closure in `hasRole`**: `usePermissions` creates a new `hasRole` closure on every render, capturing the current `user` from `useAuthContext()`. Since `user` comes from React Query with `staleTime: Infinity` (`src/hooks/use-auth.ts:60`), the roles array is stable for the session lifetime. Even if the context re-renders, the closure captures the fresh value. No stale closure risk. (`src/hooks/use-permissions.ts:27-31`)

  2. **`loadRoleMap` crash**: `loadRoleMap()` at `scripts/eslint-rules/role-import-enforcement.js:26-34` catches read errors and throws a clear message directing the developer to run `pnpm generate:api`. The build pipeline runs `pnpm generate:api:build` before `pnpm check` (per `package.json` build script), ensuring the file exists in CI. For local dev, a missing file produces an actionable error rather than a cryptic failure.

  3. **Race between generation and linting**: The build pipeline sequences `generate:api:build` before `check` which runs `check:lint`. No parallel execution risk. In dev mode, `pnpm generate:api` must be run manually, but a stale `role-map.json` simply produces outdated warnings/errors -- it does not produce false negatives because the ESLint rule only reports hooks present in the map. New hooks not yet in the map are silently allowed, which is the correct degradation. (`package.json` build script, `eslint.config.js:50`)

  4. **Duplicate constants**: The generator iterates `spec.paths` entries which are unique by path+method. Each `operationId` maps to exactly one constant name. The `roleConstants` array could theoretically receive duplicates if two different paths produced the same hook name, but `transformOperationId` includes path segments, making collisions extremely unlikely. The sort at `scripts/generate-api.js:543` would surface any collision as adjacent identical lines in the generated file, which TypeScript would catch as a duplicate declaration error.

  5. **`loadRoleMap` per-file overhead**: `loadRoleMap()` is called inside `create()` (`scripts/eslint-rules/role-import-enforcement.js:72`), which ESLint invokes once per file. For 52+ files this means 52+ `readFileSync` calls on the same small JSON file. The OS filesystem cache makes repeated reads nearly free. This matches common ESLint rule patterns and is not a measurable performance concern.

---

## 8) Invariants Checklist (table)

- Invariant: Every mutation hook in the generated `hooks.ts` that has a non-reader `x-required-role` must have a corresponding entry in `role-map.json`.
  - Where enforced: `scripts/generate-api.js:504-529` -- the same loop that collects `roleConstants` also populates `roleMap` for mutation methods.
  - Failure mode: If the generator loop diverges (e.g., a filter is added to one collection but not the other), hooks could exist in `hooks.ts` without map entries, silently bypassing ESLint enforcement.
  - Protection: Both collections are populated in the same `for` loop body with no conditional branching between them (the mutation check at line 526 only gates `roleMap`, not `roleConstants`, which is correct). Unit tests at `scripts/__tests__/generate-roles.test.ts:106-125` verify the mutation-only filtering.
  - Evidence: `scripts/generate-api.js:504-529`, `scripts/__tests__/generate-roles.test.ts:106-125`

- Invariant: The `RequiredRole` type union must exactly match the set of distinct non-read role values present in the OpenAPI spec.
  - Where enforced: `scripts/generate-api.js:503,534` -- `roleValues` Set collects unique values, union is derived from it.
  - Failure mode: If a new role value appears in the spec but the generator is not re-run, the union becomes stale and TypeScript would reject the new value in `Gate`/`usePermissions` calls.
  - Protection: The build pipeline runs `pnpm generate:api:build` before type-checking. Unit test at `scripts/__tests__/generate-roles.test.ts:154-172` verifies multi-value union generation.
  - Evidence: `scripts/generate-api.js:503,534,549`, `package.json` build script

- Invariant: `Gate` renders children if and only if the user holds at least one of the required roles.
  - Where enforced: `src/components/auth/gate.tsx:43-46` -- `roles.some(role => hasRole(role))` drives the `authorized` boolean.
  - Failure mode: If `hasRole` returns a truthy non-boolean value, or if the `some` predicate is inverted, children could render for unauthorized users.
  - Protection: TypeScript enforces `hasRole` returns `boolean` (`src/hooks/use-permissions.ts:16`). Unit tests at `src/components/auth/__tests__/gate.test.tsx:52-95` cover all branches of the decision logic.
  - Evidence: `src/components/auth/gate.tsx:43-52`, `src/hooks/use-permissions.ts:29-31`

---

## 9) Questions / Needs-Info

- Question: Is the `warn` severity for `role-gating/role-import-enforcement` intentional as a soft-launch, or should it be `error` per the plan?
- Why it matters: At `warn`, the rule does not block CI. The 52 existing violations will accumulate as warnings until the follow-up slice resolves them. If `error` was intended, the follow-up slice must be completed before merging, or the existing files need `eslint-disable` comments.
- Desired answer: Confirmation that `warn` is intentional for now, with a note on when it should be promoted to `error`.

---

## 10) Risks & Mitigations (top 3)

- Risk: The 52 ESLint warnings grow as developers add more mutation hook imports without role constants, since the rule is at `warn` severity and not blocking.
- Mitigation: Promote the rule to `error` in the follow-up slice when Gate is wired into UI pages and all existing violations are resolved. Add a comment in `eslint.config.js` documenting this plan.
- Evidence: `eslint.config.js:50`, ESLint output showing 52 warnings across existing files.

- Risk: The `loadRoleMap()` function reads `role-map.json` via `process.cwd()` which may differ from the project root in unusual editor/CI configurations.
- Mitigation: The ESLint rule throws a clear error message with the full path if the file is not found (`scripts/eslint-rules/role-import-enforcement.js:31-33`). The build pipeline ensures the file exists. For local development, the error message directs the developer to run `pnpm generate:api`.
- Evidence: `scripts/eslint-rules/role-import-enforcement.js:17-34`

- Risk: Gate/usePermissions lack component-level rendering tests, relying on logic proxy functions for coverage.
- Mitigation: The components are thin wrappers (5-6 lines of logic each) over well-tested pure functions. The plan explicitly defers Playwright integration tests to the follow-up slice when Gate is wired into UI pages. The module-export smoke tests confirm the components are importable without errors.
- Evidence: `src/components/auth/__tests__/gate.test.tsx:21-29`, `src/hooks/__tests__/use-permissions.test.ts:29-95`

---

## 11) Confidence

Confidence: High -- The implementation is clean, well-documented, faithful to the plan, and passes all verification gates. The findings are minor (JSDoc accuracy, rule severity documentation, test coverage depth) and none threaten correctness or stability. The code is ready to ship with the conditions noted.
