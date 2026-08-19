# Plan Review: Role Gating Infrastructure

## 1) Summary & Decision

**Readiness**

The plan is well-researched, thoroughly evidenced, and aligns with the existing codebase patterns. It correctly identifies the generator infrastructure, auth context structure, ESLint rule conventions, and the OpenAPI spec annotations. The scope is tight, incremental, and self-contained. Prior review findings around vitest configuration, ESLint config block specification, Knip handling, and `role-map.json` path resolution have all been addressed with concrete, implementable solutions. No ambiguities remain that would block implementation.

**Decision**

`GO` -- The plan is implementation-ready. All previously identified conditions have been resolved. The remaining adversarial findings are minor and do not block work.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 17 required headings (0-16) are present with appropriate content following the prescribed templates.
- `docs/product_brief.md` -- Pass -- `plan.md:298-302` correctly notes that role gating is a UX convenience, not a security boundary. The plan does not conflict with the product brief.
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:96-98` correctly references `src/hooks/` for custom hooks and `src/components/auth/` for auth components, matching the domain-driven layout described in the architecture doc.
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:47` explicitly defers Playwright specs since no UI pages consume `Gate` yet. This aligns with the guide's principle that instrumentation drives specs.

**Fit with codebase**

- `scripts/generate-api.js` -- `plan.md:80-82` -- Confirmed: `generateAPI()` at lines 472-502 calls generation functions sequentially. Adding `generateRoles(spec)` follows the same pattern. The `transformOperationId` + `capitalize` helpers are correctly identified as reusable.
- `src/contexts/auth-context.tsx` -- `plan.md:96-98` -- Confirmed: `useAuthContext()` at line 35 provides `user` with `roles: string[]`.
- `src/components/auth/auth-gate.tsx` -- `plan.md:92-94` -- Confirmed: `AuthGate` is an authentication gate. The proposed `Gate` serves a distinct role-gating purpose. Naming and co-location are appropriate.
- `eslint.config.js` -- `plan.md:104-122` -- Now fully specified: The plan provides a concrete config block with `files: ['src/**/*.{ts,tsx}']` scope and a `role-gating` plugin namespace, separate from the `testing` plugin block. This correctly avoids applying the rule to test files or generated files.
- `vitest.config.ts` -- `plan.md:124-126` -- Now resolved: The plan explicitly specifies extending the vitest `include` to `['src/**/__tests__/**/*.test.ts', 'scripts/**/__tests__/**/*.test.ts']` and notes that script-level tests must use relative imports.
- `knip.config.ts` -- `plan.md:379-381` -- Now concrete: Generated files are covered by the `src/lib/api/generated/**` Knip ignore. `Gate` and `usePermissions` are reachable through unit test imports within the `src/**/*.{ts,tsx}` project glob.

## 3) Open Questions & Ambiguities

- Question: How should the ESLint rule handle re-exports or barrel files that re-export mutation hooks?
- Why it matters: If a utility file re-exports a mutation hook from a barrel, the rule might not detect the transitive import.
- Needed answer: Research confirms this is a non-issue. The codebase does not use barrel re-exports for generated hooks (`src/hooks/` wraps hooks rather than re-exporting them). The rule can safely target only direct imports from `generated/hooks`.

- Question: Should the ESLint rule target only `src/**/*.{ts,tsx}` or also `tests/**/*.{ts,tsx}`?
- Why it matters: Test files importing mutation hooks would trigger false positives if the rule applies there.
- Needed answer: The plan now specifies the rule applies only to `src/**/*.{ts,tsx}` via a dedicated config block (`plan.md:108-122`). This is correct and sufficient.

No unresolved questions remain.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Generator output (`roles.ts` and `role-map.json`)
- Scenarios:
  - Given the current OpenAPI spec, When `generateRoles(spec)` runs, Then `roles.ts` contains 64 constants (one per editor-role endpoint) with correct names and values (`plan.md:319-325`)
  - Given an endpoint with `x-required-role: "reader"`, When `generateRoles(spec)` runs, Then no constant or map entry is generated (`plan.md:324`)
  - Given an endpoint without `x-required-role`, When `generateRoles(spec)` runs, Then that endpoint is skipped (`plan.md:325`)
- Instrumentation: Vitest unit test at `scripts/__tests__/generate-roles.test.ts` with synthetic spec data and relative imports
- Backend hooks: None -- build-time script
- Gaps: None -- test location and vitest config change are now specified concretely (`plan.md:326-328`)
- Evidence: `plan.md:326-328`

- Behavior: ESLint rule enforcement
- Scenarios:
  - Given a file importing a mutation hook without its role constant, When lint runs, Then an error is reported (`plan.md:332`)
  - Given a file importing both the mutation hook and its role constant, When lint runs, Then no error (`plan.md:333`)
  - Given a file importing a query hook, When lint runs, Then no error (`plan.md:334`)
- Instrumentation: ESLint `RuleTester` with inline code strings
- Backend hooks: None
- Gaps: None
- Evidence: `plan.md:330-338`

- Behavior: `Gate` component and `usePermissions` hook
- Scenarios:
  - Given a user with editor role and Gate requiring editor, When Gate renders, Then children are visible (`plan.md:342`)
  - Given a user without editor role and Gate requiring editor, When Gate renders, Then children hidden, fallback shown if provided (`plan.md:343`)
  - Given a user with reader-only roles and Gate requiring `["editor", "admin"]`, When Gate renders, Then children are hidden (`plan.md:344`)
- Instrumentation: Vitest unit tests with mock AuthContext provider
- Backend hooks: None
- Gaps: Playwright integration tests explicitly deferred to the follow-up slice (`plan.md:348`). Justified since Gate is not wired into any pages yet.
- Evidence: `plan.md:340-349`

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

**Minor -- ESLint rule `role-map.json` caching behavior under watch mode**

**Evidence:** `plan.md:214` -- "`role-map.json` is read once per lint run (cached by the module system)."

**Why it matters:** When using `eslint --watch` or IDE integrations that keep the ESLint process alive, the `role-map.json` file is read via `fs.readFileSync` at module load time (or rule initialization). If a developer regenerates the API while the IDE is running, the ESLint process may hold a stale version of the role map until restarted. This is a minor ergonomic issue since the developer would need to restart their IDE/lint watcher to pick up new mappings.

**Fix suggestion:** This is acceptable for the initial implementation. The plan already acknowledges the staleness window for local development (`plan.md:389`). A future enhancement could read the file in the `create()` function rather than at module scope, trading a small performance cost for freshness. No plan change needed.

**Confidence:** Medium

---

**Minor -- Generator produces constants for non-mutation reader-skipped endpoints but only maps mutations**

**Evidence:** `plan.md:182-187` -- Step 3 processes all operations with `x-required-role` that differs from reader, but step 3e only adds mutation methods to the role map.

**Why it matters:** If a GET endpoint were annotated with a non-reader role (e.g., `x-required-role: "admin"` on a GET), the generator would produce a role constant in `roles.ts` but no entry in `role-map.json`. The ESLint rule would not enforce the co-import for that query hook. However, this is architecturally correct -- query hooks do not need gating since they return data the backend already filters. The constant would still be available for manual use in `Gate` components. This is consistent behavior, not a gap.

**Fix suggestion:** No change needed. The behavior is correct and intentional per the plan's assumptions (`plan.md:55`).

**Confidence:** Low

---

- Checks attempted: Race condition between `AuthGate` resolution and `Gate` rendering; stale `user.roles` after session change; React 19 concurrent rendering with context reads; generated constant name collisions across endpoints.
- Evidence: `plan.md:224-226` -- `staleTime: Infinity` prevents re-fetch; `plan.md:248` -- `AuthGate` blocks tree; `plan.md:143-144` -- constant names derived from unique hook names which are derived from unique operation IDs.
- Why the plan holds: The `staleTime: Infinity` setting on the auth query means roles never go stale mid-session, eliminating cache consistency concerns. `AuthGate` blocks the tree until auth resolves, so `Gate` never sees a null user in practice. The naming derivation is injective (unique hook names produce unique constant names) because operation IDs are unique in the OpenAPI spec. React 19 concurrent features do not affect synchronous context reads.

## 6) Derived-Value & State Invariants (table)

- Derived value: `hasRole` result (in `usePermissions`)
  - Source dataset: `useAuthContext().user.roles` (unfiltered -- the full role array from the backend)
  - Write / cleanup triggered: None -- purely read-only check
  - Guards: Returns `false` when `user` is `null`. `AuthGate` prevents the tree from rendering before auth resolves.
  - Invariant: `hasRole(r)` must equal `user.roles.includes(r)` for all `r`. The roles array is immutable for the session (`staleTime: Infinity`).
  - Evidence: `plan.md:221-226`; `src/hooks/use-auth.ts:60`

- Derived value: `RequiredRole` union type
  - Source dataset: Distinct non-read `x-required-role` values from the OpenAPI spec at generation time
  - Write / cleanup triggered: Written to `roles.ts` on `pnpm generate:api`. No runtime writes.
  - Guards: Automatically expands when new role values appear in the spec.
  - Invariant: The union contains exactly the set of non-read role values present in the spec.
  - Evidence: `plan.md:228-233`; `openapi-cache/openapi.json:16956-16959`

- Derived value: Role map entries (hook-to-constant mapping)
  - Source dataset: Mutation operations whose `x-required-role` differs from `x-auth-roles.read`
  - Write / cleanup triggered: Written to `role-map.json` on `pnpm generate:api`. Consumed at lint time.
  - Guards: Only mutation methods included. Both files generated from the same spec iteration.
  - Invariant: Every key in `role-map.json` corresponds to an exported hook in `hooks.ts`, and every value corresponds to an exported constant in `roles.ts`.
  - Evidence: `plan.md:235-240`; `scripts/generate-api.js:100-115`

## 7) Risks & Mitigations (top 3)

- Risk: `role-map.json` becomes stale if a developer adds new mutation endpoints without running `pnpm generate:api`, causing the ESLint rule to miss enforcement for new hooks.
- Mitigation: The build pipeline runs `pnpm generate:api:build` before `pnpm check` in the `build` script (`package.json:9`). The staleness window is limited to local development between regeneration runs.
- Evidence: `plan.md:387-389`

- Risk: The ESLint rule triggers false positives on application source files that legitimately import mutation hooks without needing gating (e.g., custom hooks that wrap mutations).
- Mitigation: The rule is scoped to `src/**/*.{ts,tsx}` with generated files excluded. Custom hooks that wrap mutations will import the hook and should also import the role constant as part of the gating contract. If specific files need exceptions, `eslint-disable-next-line` with a justification comment is the escape hatch.
- Evidence: `plan.md:383-385`

- Risk: Future spec introduces an `admin`-level endpoint requiring the `RequiredRole` union and role map to expand, potentially breaking existing type assertions.
- Mitigation: The union is automatically derived from distinct non-read role values, so adding `"admin"` endpoints to the spec naturally expands the union on next generation. TypeScript's exhaustive checking would surface any code that assumes `RequiredRole` is only `"editor"`.
- Evidence: `plan.md:141`; `openapi-cache/openapi.json:16957` -- `admin` role is already defined in `x-auth-roles`

## 8) Confidence

Confidence: High -- The plan is comprehensive, well-evidenced, and addresses all previously identified gaps. The infrastructure-only scope (no UI wiring) limits risk. All four implementation slices have clear goals, specific file targets, and explicit dependency chains. The test plan covers all new surfaces with concrete test locations and vitest config changes.
