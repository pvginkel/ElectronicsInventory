# Role Gating Infrastructure — Technical Plan

## 0) Research Log & Findings

**Searched areas and key discoveries:**

- **OpenAPI spec** (`openapi-cache/openapi.json`): Every endpoint carries an `x-required-role` annotation (115 total: 64 `editor`, 51 `reader`). The spec root exposes `x-auth-roles` with `{ admin: "admin", read: "reader", write: "editor" }`. No `admin`-role endpoints exist today, so the `RequiredRole` union will initially contain only `"editor"`.
- **Existing generator** (`scripts/generate-api.js`): Reads the spec via `fetchAndCache`, iterates `spec.paths`, and writes three files to `src/lib/api/generated/` (`types.ts`, `client.ts`, `hooks.ts`). The `transformOperationId` + `capitalize` helpers already produce the hook names we need to derive constant names from (e.g., `useDeletePartsByPartKey`).
- **Auth infrastructure** (`src/hooks/use-auth.ts`, `src/contexts/auth-context.tsx`, `src/components/auth/auth-gate.tsx`): `UserInfo` already has a `roles: string[]` field populated from the backend. `AuthContext` exposes `user` to the tree. The existing `AuthGate` handles authentication gating (loading/error/redirect); the new `Gate` component is a different concern (role-based visibility).
- **ESLint setup** (`eslint.config.js`): Uses flat config with `typescript-eslint`. Generated files under `src/lib/api/generated/**` are **ignored** by ESLint. A custom rule pattern already exists at `scripts/eslint-rules/testing/no-route-mocks.js` — the new role-import rule will follow the same structure.
- **Vitest** (`vitest.config.ts`): Unit tests live under `src/**/__tests__/**/*.test.ts`. The generator logic itself is a Node script; generator tests will live at `scripts/__tests__/generate-roles.test.ts` which requires extending the vitest `include` array to also match `scripts/**/__tests__/**/*.test.ts`. Tests under `scripts/` must use relative imports (the `@` path alias resolves to `src/` and will not work for script-level tests).
- **Knip / dead code**: `pnpm check:knip` runs Knip. Generated files are already ignored by ESLint; the new `roles.ts` and `role-map.json` will need to be consumed by the ESLint rule and `Gate`/`usePermissions` so Knip does not flag them.

**Conflicts resolved:**

- The existing `AuthGate` at `src/components/auth/auth-gate.tsx` is an authentication gate (blocks until login resolves). The new `Gate` component serves a different purpose (role-based visibility). Naming it `Gate` and placing it at `src/components/auth/gate.tsx` avoids confusion while keeping auth-related components co-located.

---

## 1) Intent & Scope

**User intent**

Build the foundational infrastructure for role-based UI gating so that components can declaratively hide or disable features based on the authenticated user's roles, with all role metadata auto-generated from the OpenAPI spec and enforced by a custom ESLint rule.

**Prompt quotes**

- "Generator script that reads `openapi-cache/openapi.json` and produces `src/lib/api/generated/roles.ts`"
- "Gate component accepts `requires` prop (single `RequiredRole` or array) and optional `fallback` prop"
- "Custom ESLint rule reads generated `role-map.json` and enforces: if a file imports a mutation hook listed in the map, it must also import the corresponding role constant"
- "Only generates constants for endpoints whose `x-required-role` differs from the `x-auth-roles.read` value"

**In scope**

- Generator script producing `roles.ts` and `role-map.json`
- `Gate` component for declarative role gating
- `usePermissions` hook for imperative role checks
- Custom ESLint rule enforcing role-constant co-imports with mutation hooks
- Integration of the generator into `pnpm generate:api`
- Unit tests for the generator and ESLint rule

**Out of scope**

- Wiring `Gate` into existing UI pages (second push per change brief)
- Route-level guards (readers and editors see the same pages)
- Role hierarchy logic (backend responsibility)
- Playwright specs for `Gate` rendering (no UI pages use `Gate` yet in this slice)

**Assumptions / constraints**

- The backend provides the full role list in `UserInfo.roles` — the frontend performs flat `includes()` checks with no hierarchy encoding.
- `x-required-role` is present on every operation in the spec. If an operation lacks it, the generator skips it (defensive).
- `x-auth-roles.read` is always `"reader"` and identifies the baseline role to suppress from generated constants.
- The ESLint rule only applies to application source files (not generated files, not test files). The existing `ignores` for `src/lib/api/generated/**` already excludes generated output.
- The generated `role-map.json` maps only mutation hook names (POST/PUT/PATCH/DELETE) since GET hooks correspond to reader-level access and do not need gating.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Generator script reads `x-required-role` from each endpoint in `openapi-cache/openapi.json`
- [ ] Generator reads `x-auth-roles.read` from the spec root and suppresses constants for endpoints whose required role matches that value
- [ ] Generator outputs `src/lib/api/generated/roles.ts` with named constants (e.g., `deletePartsByPartKeyRole = "editor" as const`) and a `RequiredRole` union type
- [ ] Generator outputs `src/lib/api/generated/role-map.json` mapping mutation hook names to role constant names
- [ ] Constant naming convention: strip `use` prefix from hook name, add `Role` suffix (e.g., `useDeletePartsByPartKey` -> `deletePartsByPartKeyRole`)
- [ ] `RequiredRole` union is derived from distinct non-read role values found in the spec
- [ ] `Gate` component accepts `requires` prop (single `RequiredRole` or array) and optional `fallback` prop
- [ ] `Gate` performs flat `user.roles.includes()` check -- no hierarchy encoding
- [ ] `usePermissions` hook provides `hasRole(role: RequiredRole): boolean` check
- [ ] Custom ESLint rule reads generated `role-map.json` and enforces that importing a mutation hook requires importing the corresponding role constant
- [ ] Generator script integrates into `pnpm generate:api` command
- [ ] All generated files follow existing code generation patterns in the project

---

## 2) Affected Areas & File Map

- Area: `scripts/generate-api.js`
- Why: Add a `generateRoles(spec)` function that produces `roles.ts` and `role-map.json`, and call it from `generateAPI()`.
- Evidence: `scripts/generate-api.js:472-502` — the `generateAPI` function calls `generateTypes()`, `generateClient()`, `generateHooks(spec)` sequentially; the new `generateRoles(spec)` call follows the same pattern.

- Area: `src/lib/api/generated/roles.ts` (new file, generated)
- Why: Contains named role constants for each non-reader mutation endpoint and the `RequiredRole` union type.
- Evidence: Pattern follows `src/lib/api/generated/hooks.ts` (generated, prefixed with "do not edit manually" comment).

- Area: `src/lib/api/generated/role-map.json` (new file, generated)
- Why: Maps mutation hook names to role constant names, consumed by the ESLint rule at lint time.
- Evidence: JSON file in the generated directory; the ESLint rule reads it via `fs.readFileSync` at rule initialization (same approach as the `no-route-mocks` rule loading static data).

- Area: `src/components/auth/gate.tsx` (new file)
- Why: Declarative role-gating component that conditionally renders children based on user roles.
- Evidence: `src/components/auth/auth-gate.tsx:1-158` — existing auth component in the same directory; `Gate` follows the same structural conventions (props interface, context consumption, JSDoc).

- Area: `src/hooks/use-permissions.ts` (new file)
- Why: Imperative hook for role checks, used internally by `Gate` and available to component code.
- Evidence: `src/hooks/use-auth.ts:55-88` — existing hook that consumes `useGetAuthSelf`; `usePermissions` consumes `useAuthContext` in the same pattern. `src/contexts/auth-context.tsx:35-41` — `useAuthContext()` provides `user` with `roles: string[]`.

- Area: `scripts/eslint-rules/role-import-enforcement.js` (new file)
- Why: Custom ESLint rule that enforces co-import of role constants when mutation hooks are imported.
- Evidence: `scripts/eslint-rules/testing/no-route-mocks.js:1-234` — existing custom rule providing the structural template for rule metadata, `create()` function, and AST visitor pattern.

- Area: `eslint.config.js`
- Why: Register the new `role-import-enforcement` rule in a new config block scoped to `src/**/*.{ts,tsx}`. The existing `testing` plugin block targets `tests/**/*.{ts,tsx}`, so the new rule needs its own block with a distinct plugin namespace (e.g., `role-gating`) to avoid applying to test files. The top-level `ignores` for `src/lib/api/generated/**` already excludes generated output from the rule.
- Evidence: `eslint.config.js:6` — imports `testingNoRouteMocksRule`; the new rule follows the same import pattern. `eslint.config.js:39-58` — the `testing` plugin block demonstrates the per-scope plugin registration approach.
- Config shape:
  ```javascript
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'role-gating': {
        rules: {
          'role-import-enforcement': roleImportEnforcementRule,
        },
      },
    },
    rules: {
      'role-gating/role-import-enforcement': 'error',
    },
  }
  ```

- Area: `vitest.config.ts`
- Why: Extend the `include` array to pick up generator tests under `scripts/__tests__/`.
- Evidence: `vitest.config.ts:11` — current include is `['src/**/__tests__/**/*.test.ts']`; must be expanded to `['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts']`.

---

## 3) Data Model / Contracts

- Entity / contract: Generated role constants (`roles.ts`)
- Shape:
  ```typescript
  // One constant per non-reader mutation endpoint
  export const postAiPartsAnalyzeRole = "editor" as const;
  export const deletePartsByPartKeyRole = "editor" as const;
  // ... etc.

  // Union of distinct non-read role values
  export type RequiredRole = "editor"; // expands if "admin" endpoints appear
  ```
- Mapping: Hook name `useDeletePartsByPartKey` -> strip `use` prefix, lowercase first char, append `Role` -> `deletePartsByPartKeyRole`. The constant value comes directly from `x-required-role` in the spec.
- Evidence: `scripts/generate-api.js:309-335` — `transformOperationId` and `capitalize` produce the hook name; the role constant name is derived by reversing the `use` prefix and appending `Role`.

- Entity / contract: Role map (`role-map.json`)
- Shape:
  ```json
  {
    "usePostAiPartsAnalyze": "postAiPartsAnalyzeRole",
    "useDeletePartsByPartKey": "deletePartsByPartKeyRole"
  }
  ```
- Mapping: Keys are the full hook names (as exported from `hooks.ts`); values are the corresponding constant names (as exported from `roles.ts`).
- Evidence: The ESLint rule reads this JSON at initialization and uses it to check import statements.

- Entity / contract: `UserInfo.roles`
- Shape: `roles: string[]` — array of role strings provided by the backend (e.g., `["reader", "editor"]`).
- Mapping: No transformation needed; already camelCase and consumed via `useAuthContext().user.roles`.
- Evidence: `src/hooks/use-auth.ts:13-18` — `UserInfo` interface with `roles: string[]`.

---

## 4) API / Integration Surface

- Surface: `GET /api/auth/self` (existing, via `useGetAuthSelf`)
- Inputs: None (session cookie)
- Outputs: `{ email, name, roles: string[], subject }` — the `roles` array is the source of truth for all gating decisions.
- Errors: 401 triggers redirect (handled by auth middleware in `client.ts`); other errors surface via `AuthGate`.
- Evidence: `src/hooks/use-auth.ts:6` — imports `useGetAuthSelf`; `src/hooks/use-auth.ts:37-43` — `transformUserInfo` maps to `UserInfo` preserving `roles`.

No new API endpoints are introduced. The generator reads the static `openapi-cache/openapi.json` file, not a live endpoint.

---

## 5) Algorithms & UI Flows

- Flow: Role constant and map generation
- Steps:
  1. Read `x-auth-roles.read` from spec root to determine the baseline role (e.g., `"reader"`).
  2. Iterate all paths and methods in `spec.paths`.
  3. For each operation with an `operationId` and `x-required-role`:
     a. Skip if `x-required-role` equals the baseline read role.
     b. Compute the hook name using existing `transformOperationId` + `capitalize` (e.g., `useDeletePartsByPartKey`).
     c. Derive the constant name: strip `use` prefix, lowercase first character, append `Role` (e.g., `deletePartsByPartKeyRole`).
     d. Record the role value from `x-required-role`.
     e. If the method is a mutation (POST/PUT/PATCH/DELETE), add an entry to the role map.
  4. Collect distinct role values into a set for the `RequiredRole` union.
  5. Write `roles.ts` with all constants and the union type.
  6. Write `role-map.json` with the mutation hook-to-constant mapping.
- States / transitions: Purely build-time; no runtime state machine.
- Hotspots: None — runs once during code generation.
- Evidence: `scripts/generate-api.js:90-131` — existing `generateHooks` follows the same iteration pattern over `spec.paths`.

- Flow: `Gate` component render
- Steps:
  1. `Gate` calls `usePermissions()` to obtain the `hasRole` function.
  2. Normalize `requires` prop to an array if a single string is passed.
  3. Check if the user has any of the required roles via `hasRole`.
  4. If authorized, render `children`.
  5. If not authorized and `fallback` is provided, render `fallback`.
  6. If not authorized and no `fallback`, render `null`.
- States / transitions: Stateless — purely derived from context.
- Hotspots: Minimal; `includes()` on a small array is negligible.
- Evidence: `src/contexts/auth-context.tsx:35-41` — `useAuthContext` provides `user.roles`.

- Flow: ESLint rule enforcement
- Steps:
  1. At rule initialization, read `role-map.json` from the generated directory. Resolve the path using `process.cwd()` (which ESLint sets to the project root): `path.join(process.cwd(), 'src/lib/api/generated/role-map.json')`. If the file is not found, throw a clear error: `"role-map.json not found. Run 'pnpm generate:api' to generate it."`
  2. On `ImportDeclaration` nodes, track: (a) imports from `generated/hooks` and check if any imported specifier is a key in the role map; (b) imports from `generated/roles` and record which role constants are imported.
  3. On `Program:exit`, for each mutation hook imported from the hooks module that has an entry in the role map, verify that the corresponding role constant is also imported in the same file.
  4. Report a diagnostic if the role constant import is missing.
- States / transitions: Single-pass AST traversal with two collection sets.
- Hotspots: `role-map.json` is read once per lint run (cached by the module system).
- Evidence: `scripts/eslint-rules/testing/no-route-mocks.js:112-230` — existing rule uses the same `create()` + AST visitor + `Program:exit` pattern.

---

## 6) Derived State & Invariants

- Derived value: `hasRole` result (in `usePermissions`)
  - Source: `useAuthContext().user.roles` (the authenticated user's role array from `GET /api/auth/self`).
  - Writes / cleanup: None — purely a read-only check. No cache mutations or side effects.
  - Guards: If `user` is `null` (unauthenticated), `hasRole` returns `false`. The `AuthGate` component already prevents rendering the app tree before auth resolves, so in practice `user` is always non-null when `Gate` renders.
  - Invariant: The roles array is immutable for the lifetime of the session (no live updates). `staleTime: Infinity` on the auth query ensures no re-fetches.
  - Evidence: `src/hooks/use-auth.ts:56-63` — `useAuth` sets `staleTime: Infinity` and `refetchOnWindowFocus: false`.

- Derived value: `RequiredRole` union type
  - Source: Distinct non-read `x-required-role` values in the OpenAPI spec at generation time.
  - Writes / cleanup: Written to `roles.ts` during generation; regenerated on every `pnpm generate:api` run.
  - Guards: If the spec adds a new role value (e.g., `"admin"`), the union automatically expands on next generation.
  - Invariant: The union must always match the actual role values in the spec. Running `pnpm generate:api` keeps it in sync.
  - Evidence: `openapi-cache/openapi.json` line 16956-16959 — `x-auth-roles` defines `admin`, `read` (reader), `write` (editor).

- Derived value: Role map entries
  - Source: Mutation operations in the spec whose `x-required-role` differs from the read baseline.
  - Writes / cleanup: Written to `role-map.json` during generation.
  - Guards: Only mutation methods (POST/PUT/PATCH/DELETE) are included. GET operations are excluded since they map to reader-level access.
  - Invariant: Every mutation hook in `hooks.ts` that has a non-reader `x-required-role` must have a corresponding entry in `role-map.json`. The generator produces both files from the same spec iteration.
  - Evidence: `scripts/generate-api.js:100-115` — existing code iterates paths and distinguishes queries from mutations by HTTP method.

---

## 7) State Consistency & Async Coordination

- Source of truth: `AuthContext` (`src/contexts/auth-context.tsx`) is the single source of truth for `user.roles`. Both `Gate` and `usePermissions` read from this context.
- Coordination: `usePermissions` wraps `useAuthContext`; `Gate` calls `usePermissions`. There is no independent state — both derive from the same context value.
- Async safeguards: The `AuthGate` component at the app root prevents the component tree from rendering until `user` is resolved. Therefore, `usePermissions` will always have a non-null user when called from within the authenticated app shell. If called outside `AuthGate` (defensive case), `hasRole` returns `false`.
- Instrumentation: No new instrumentation events are needed for this slice. The `Gate` component is a pure render gate with no async behavior or loading states. Instrumentation will be added when `Gate` is wired into actual UI (out of scope).
- Evidence: `src/contexts/auth-context.tsx:59-106` — `AuthProvider` provides `user`; `src/components/auth/auth-gate.tsx:137-158` — `AuthGate` blocks rendering until auth resolves.

---

## 8) Errors & Edge Cases

- Failure: User has no roles (empty array)
  - Surface: `Gate` component, `usePermissions` hook
  - Handling: `hasRole` returns `false`; `Gate` renders `fallback` or nothing. This is correct behavior — the user sees the reader-only view.
  - Guardrails: The backend always assigns at least `"reader"` to authenticated users. Even if it does not, the UI degrades gracefully.
  - Evidence: `src/hooks/use-auth.ts:13-18` — `roles: string[]` allows empty arrays.

- Failure: `role-map.json` is missing or malformed at lint time
  - Surface: ESLint rule initialization
  - Handling: The rule should catch the read error and either disable itself (no reports) or throw a clear error message directing the developer to run `pnpm generate:api`.
  - Guardrails: The `pnpm check` pipeline runs `pnpm generate:api:build` before `pnpm check:lint` in the build script, ensuring the file exists. For local development, `pnpm generate:api` must be run after cloning.
  - Evidence: `package.json:9` — build script runs `generate:api:build` before `check`.

- Failure: An operation in the spec lacks `x-required-role`
  - Surface: Generator script
  - Handling: Skip the operation — no constant or map entry is generated. This is defensive and prevents crashes if the backend adds an unannotated endpoint.
  - Guardrails: Log a warning during generation so developers notice missing annotations.
  - Evidence: The generator already skips operations without `operationId` (`scripts/generate-api.js:103`); the same pattern applies.

- Failure: `Gate` rendered outside `AuthProvider`
  - Surface: `usePermissions` -> `useAuthContext`
  - Handling: `useAuthContext` throws `"useAuthContext must be used within AuthProvider"`. This is an intentional developer error caught during development.
  - Guardrails: The existing error message is clear; no change needed.
  - Evidence: `src/contexts/auth-context.tsx:37-40`.

---

## 9) Observability / Instrumentation

No new runtime instrumentation is added in this slice. The `Gate` component has no async behavior, loading states, or error surfaces that require test-event emission. Instrumentation will be added in the follow-up slice when `Gate` is wired into actual UI pages with Playwright coverage.

The generator script logs progress messages to the console following the existing pattern (emoji + description), which aids debugging during `pnpm generate:api` runs.

---

## 10) Lifecycle & Background Work

No new lifecycle hooks, effects, timers, or subscriptions are introduced. The `Gate` component and `usePermissions` hook are synchronous consumers of context state. The generator is a build-time script with no runtime footprint.

---

## 11) Security & Permissions

- Concern: Role-based UI gating is a UX convenience, not a security boundary
- Touchpoints: `Gate` component, `usePermissions` hook
- Mitigation: The backend enforces `x-required-role` on every endpoint. If a user bypasses the frontend gate (e.g., by manipulating DOM or calling APIs directly), the backend rejects unauthorized requests with 403. The frontend gating prevents confusing UX where a user sees controls they cannot use.
- Residual risk: A mismatch between generated role constants and actual backend enforcement could cause the UI to show controls that the backend rejects, or hide controls the user could actually use. This is mitigated by generating constants directly from the same OpenAPI spec the backend publishes.
- Evidence: `openapi-cache/openapi.json` — every endpoint has `x-required-role`; the spec is the shared contract between backend and frontend.

---

## 12) UX / UI Impact

No direct UX changes in this slice. The `Gate` component and `usePermissions` hook are infrastructure — they will be consumed by UI components in the follow-up slice.

When `Gate` is used, its behavior is:
- If the user has the required role: children render normally (no visual change).
- If the user lacks the required role and `fallback` is provided: the fallback renders (e.g., a disabled button with a tooltip).
- If the user lacks the required role and no `fallback`: nothing renders (the gated element is hidden).

---

## 13) Deterministic Test Plan

- Surface: Generator script (`scripts/generate-api.js` — `generateRoles` function)
- Scenarios:
  - Given the current OpenAPI spec, When `generateRoles(spec)` runs, Then `roles.ts` contains a constant for each non-reader mutation endpoint with the correct name and value.
  - Given the current OpenAPI spec, When `generateRoles(spec)` runs, Then `roles.ts` contains a `RequiredRole` union with `"editor"` (and any other non-read roles found).
  - Given the current OpenAPI spec, When `generateRoles(spec)` runs, Then `role-map.json` contains an entry for each non-reader mutation hook mapping to its role constant name.
  - Given an endpoint with `x-required-role: "reader"`, When `generateRoles(spec)` runs, Then no constant or map entry is generated for that endpoint.
  - Given an endpoint without `x-required-role`, When `generateRoles(spec)` runs, Then that endpoint is skipped without error.
- Instrumentation / hooks: Unit test via vitest; construct a minimal spec object and assert on the generated output strings / parsed JSON. Generator tests live at `scripts/__tests__/generate-roles.test.ts` using relative imports (the `@` path alias does not resolve outside `src/`).
- Gaps: None for the generator; it is fully testable with synthetic spec data.
- Evidence: `vitest.config.ts` — the `include` array must be extended to `['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts']` to pick up generator tests. This config change is part of Slice 4.

- Surface: ESLint rule (`scripts/eslint-rules/role-import-enforcement.js`)
- Scenarios:
  - Given a file that imports `useDeletePartsByPartKey` from `generated/hooks`, When the file does not import `deletePartsByPartKeyRole` from `generated/roles`, Then the rule reports an error.
  - Given a file that imports `useDeletePartsByPartKey` from `generated/hooks` AND imports `deletePartsByPartKeyRole` from `generated/roles`, When the rule runs, Then no error is reported.
  - Given a file that imports a query hook (e.g., `useGetPartsByPartKey`) from `generated/hooks`, When the rule runs, Then no error is reported (query hooks are not in the role map).
  - Given a file that imports a mutation hook not in the role map (hypothetical reader-level mutation), When the rule runs, Then no error is reported.
- Instrumentation / hooks: ESLint `RuleTester` from `@eslint/js` or `typescript-eslint`; test with inline code strings.
- Gaps: None.
- Evidence: The `no-route-mocks` rule at `scripts/eslint-rules/testing/no-route-mocks.js` can be tested with the same `RuleTester` pattern.

- Surface: `Gate` component and `usePermissions` hook
- Scenarios:
  - Given a user with `roles: ["reader", "editor"]` and `Gate` requiring `"editor"`, When the Gate renders, Then children are visible.
  - Given a user with `roles: ["reader"]` and `Gate` requiring `"editor"`, When the Gate renders, Then children are hidden and `fallback` (if provided) is visible.
  - Given a user with `roles: ["reader"]` and `Gate` requiring `["editor", "admin"]`, When the Gate renders, Then children are hidden (user has none of the required roles).
  - Given `usePermissions` called with a user who has `roles: ["reader", "editor"]`, When `hasRole("editor")` is called, Then it returns `true`.
  - Given `usePermissions` called with a user who has `roles: ["reader"]`, When `hasRole("editor")` is called, Then it returns `false`.
- Instrumentation / hooks: Vitest unit tests with a mock `AuthContext` provider. No Playwright specs in this slice since `Gate` is not wired into any pages yet.
- Gaps: Playwright integration tests deferred to the follow-up slice when `Gate` is wired into UI pages.
- Evidence: `src/contexts/auth-context.tsx:29` — `AuthContext` can be provided directly in tests.

---

## 14) Implementation Slices

- Slice: 1 — Generator for `roles.ts` and `role-map.json`
- Goal: Running `pnpm generate:api` produces the two new generated files alongside existing output.
- Touches: `scripts/generate-api.js`
- Dependencies: None. This is the foundational slice.

- Slice: 2 — `usePermissions` hook and `Gate` component
- Goal: Infrastructure components are available for use by any UI code.
- Touches: `src/hooks/use-permissions.ts`, `src/components/auth/gate.tsx`
- Dependencies: Slice 1 (imports `RequiredRole` from generated `roles.ts`).

- Slice: 3 — Custom ESLint rule
- Goal: `pnpm check:lint` enforces that mutation hook imports are accompanied by their role constant imports.
- Touches: `scripts/eslint-rules/role-import-enforcement.js`, `eslint.config.js`
- Dependencies: Slice 1 (reads `role-map.json`).

- Slice: 4 — Unit tests
- Goal: Generator, ESLint rule, `Gate`, and `usePermissions` are covered by automated tests.
- Touches: `scripts/__tests__/generate-roles.test.ts`, `scripts/__tests__/role-import-enforcement.test.ts`, `src/components/auth/__tests__/gate.test.ts`, `src/hooks/__tests__/use-permissions.test.ts`, `vitest.config.ts` (extend `include` to cover `scripts/__tests__/`).
- Dependencies: Slices 1-3 complete.

---

## 15) Risks & Open Questions

- Risk: Knip flags the generated `roles.ts` exports or new components as unused
- Impact: `pnpm check:knip` could fail, blocking CI.
- Mitigation: Generated files (`roles.ts`, `role-map.json`) are covered by the existing Knip ignore pattern at `knip.config.ts:27` (`src/lib/api/generated/**`). The `Gate` component and `usePermissions` hook will be imported by their vitest unit tests, which are within the `src/**/*.{ts,tsx}` project glob (`knip.config.ts:20`) and satisfy Knip's reachability analysis. The `role-map.json` file is consumed by the ESLint rule via `fs.readFileSync`, which Knip does not trace as a dependency edge, but this is moot since the file is already in the ignored directory.

- Risk: The ESLint rule triggers false positives on files that intentionally use mutation hooks without gating (e.g., internal utilities or test helpers)
- Impact: Developer friction; unnecessary `eslint-disable` comments.
- Mitigation: The ESLint rule is scoped to application source files (`src/**/*.{ts,tsx}`) and excludes test files and generated files. If specific application files need an exception, developers can use `eslint-disable-next-line` with a justification comment (matching the `no-route-mocks` convention).

- Risk: `role-map.json` not regenerated after spec changes leads to stale lint enforcement
- Impact: New mutation hooks might not be caught by the ESLint rule until `pnpm generate:api` is re-run.
- Mitigation: The build pipeline already runs `pnpm generate:api:build` before `pnpm check`. Developers are expected to run `pnpm generate:api` when the spec changes. The staleness window is limited to local development between regeneration runs.

- Risk: Future spec introduces a role value that collides with a TypeScript reserved word or common identifier
- Impact: Generated `roles.ts` could have a syntax error.
- Mitigation: Role values from the spec (`"editor"`, `"admin"`, `"reader"`) are used as string literal types and const values, not as identifiers. The constant names are derived from hook names which are already valid identifiers. Low probability.

---

## 16) Confidence

Confidence: High — The change is well-scoped infrastructure with clear patterns to follow (existing generator, existing ESLint rule, existing auth context). All inputs (OpenAPI spec, auth context) are stable, and the output (generated files, two components, one ESLint rule) is straightforward. No backend changes are required.
