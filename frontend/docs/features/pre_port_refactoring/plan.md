# Pre-Port Refactoring (Third Pass) -- Technical Plan

## 0) Research Log & Findings

**Searched areas:**
- `src/components/parts/part-list.tsx` -- `useNavigate({ from: '/parts' })` at line 36; `navigate({ to: '/parts', search: ... })` at lines 326 and 334.
- `src/components/shopping-lists/detail-header-slots.tsx` -- `<Link to={ShoppingListsRoute.fullPath}>` at lines 157 and 202.
- `src/routes/shopping-lists/$listId.tsx` -- `navigate({ to: ShoppingListsRoute.fullPath })` at line 113.
- `src/routeTree.gen.ts` -- generated route IDs confirm index routes use trailing slashes (e.g. `/parts/`, `/shopping-lists/`). The current route tree already uses trailing-slash IDs.
- `src/hooks/use-kit-shopping-list-links.ts` -- 12 callback invocations across 4 mutation wrappers (lines 134, 137, 140, 165, 168, 171, 203, 206, 209, 226, 229, 232).
- `src/hooks/use-shopping-lists.ts` -- 18 `onSuccess` callback invocations across mutation wrappers; no `onError`/`onSettled` forwarding in this file (callbacks are only `onSuccess`).
- `tests/support/selectors.ts` -- template-owned file customized with domain re-exports from `selectors-domain.ts`.
- `tests/support/selectors-domain.ts` -- app-owned domain selectors (parts, types, boxes, sellers).
- Consumers of `selectors.ts` domain re-exports: `tests/support/page-objects/part-selector-harness.ts` (uses `selectors.parts`), `tests/smoke.spec.ts` (uses `selectors.common` only -- no domain re-export needed).
- `tests/e2e/types/TypesPage.ts` -- page object in test directory instead of `tests/support/page-objects/`.
- `tests/support/fixtures.ts` -- imports `TypesPage` from `../e2e/types/TypesPage`.
- Infrastructure test directories that will become empty after removal: `auth/`, `deployment/`, `sse/`, `app-shell/`, `shell/`, `dialogs/`, `ui/`, `parallel/`.
- `.gitkeep` files found in `tests/e2e/.gitkeep` and `tests/e2e/specific/.gitkeep`.
- `tests/e2e/workflows/` directory contains both `end-to-end.spec.ts` (keep) and `instrumentation-snapshots.spec.ts` (remove).

**Key findings:**
- The current `routeTree.gen.ts` already uses trailing-slash index route IDs (`/parts/`, `/shopping-lists/`). The refactoring doc notes that the direction (add vs remove) depends on the generated output after fresh install. After deleting the lockfile and regenerating, the new route IDs will determine which paths need adjusting.
- `ShoppingListsRoute.fullPath` resolves to `'/shopping-lists/'` (trailing slash) based on the generated route tree. The `<Link>` usages in `detail-header-slots.tsx` reference this programmatically, so they should stay correct regardless of regeneration.
- The callback signature change in TanStack Query affects `mutate()` option callbacks. Currently all invocations pass 3 args to `onSuccess(data, variables, context)`, 3 to `onError(error, variables, context)`, and 4 to `onSettled(data, error, variables, context)`. The exact fix depends on the new API signature discovered after the lockfile refresh.

## 1) Intent & Scope

**User intent**

Bring the EI frontend codebase up to date with current dependency versions and clean up template/domain boundaries so the next re-port onto the frontend template is clean. This involves five well-scoped refactoring tasks: lockfile refresh with type error fixes, mutation callback signature updates, infrastructure test removal, selector import pattern fix, and page object relocation.

**Prompt quotes**

"Delete pnpm-lock.yaml and run pnpm install to get fresh deps, then fix the type errors that surface."
"For task 4 (selectors.ts), use Option A from the refactoring doc (update page objects to import from selectors-domain.ts directly)."
"All 5 tasks should be implemented."

**In scope**

- Delete `pnpm-lock.yaml`, run fresh `pnpm install`, fix resulting TanStack Router and Query type errors
- Update mutation callback invocations in `use-kit-shopping-list-links.ts` and `use-shopping-lists.ts` to match current TanStack Query API
- Remove 13 infrastructure test files (12 from the refactoring doc plus `instrumentation-snapshots.spec.ts`); keep `smoke.spec.ts` and `reset.spec.ts`
- Clean up empty directories and `.gitkeep` files after test removal
- Update page objects to import domain selectors from `selectors-domain.ts` directly (Option A)
- Restore `selectors.ts` to template-owned form (only `common` selectors)
- Move `TypesPage.ts` to `tests/support/page-objects/` and update imports

**Out of scope**

- Upgrading backend dependencies or API schema changes
- Creating new tests or features
- Modifying the frontend template mother project
- Changing any runtime behavior (these are all type-level or organizational changes)

**Assumptions / constraints**

- The backend API remains unchanged; only frontend dependency versions shift.
- `pnpm exec tsr generate` will produce a valid route tree after the lockfile refresh.
- The TanStack Query callback signature change is consistent across all mutation hooks (the exact new shape will be confirmed after fresh install).
- Git operations (staging/committing) happen outside the sandbox.

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Delete pnpm-lock.yaml and run fresh pnpm install to get current dependency versions
- [ ] Fix TanStack Router type errors: route path trailing slashes adjusted to match generated route tree
- [ ] Fix TanStack Router type errors: navigate() search param callbacks typed correctly after path fix
- [ ] Fix TanStack Query mutation callback invocations to match current API signature (onSuccess, onError, onSettled)
- [ ] Remove 13 infrastructure test files (12 listed in the refactoring doc plus `instrumentation-snapshots.spec.ts`)
- [ ] Keep smoke.spec.ts and reset.spec.ts (borderline files)
- [ ] Clean up empty directories and .gitkeep files after test removal
- [ ] Update all page objects to import domain selectors from selectors-domain.ts directly (Option A)
- [ ] Restore selectors.ts to its template-owned form (only common selectors)
- [ ] Move TypesPage.ts from tests/e2e/types/ to tests/support/page-objects/
- [ ] Update all imports referencing the moved TypesPage.ts
- [ ] pnpm check passes after all changes
- [ ] All remaining Playwright tests pass after all changes

## 2) Affected Areas & File Map

### Task 1: TanStack Router type fixes

- Area: `pnpm-lock.yaml`
- Why: Delete and regenerate to unpin old TanStack Router/Query versions.
- Evidence: File exists at project root; pins TanStack Router at ~1.131.27 per refactoring doc.

- Area: `src/routeTree.gen.ts`
- Why: Regenerated by `pnpm exec tsr generate` after fresh install. Route IDs may change format.
- Evidence: `src/routeTree.gen.ts:42-60` -- current route IDs use trailing slashes (`/parts/`, `/shopping-lists/`).

- Area: `src/components/parts/part-list.tsx`
- Why: `useNavigate({ from: '/parts' })` on line 36 and `navigate({ to: '/parts', search: ... })` on lines 326, 334 need path adjustment to match regenerated route IDs.
- Evidence: `src/components/parts/part-list.tsx:36` -- `useNavigate({ from: '/parts' })`.
- Evidence: `src/components/parts/part-list.tsx:326-335` -- two `navigate()` calls with `search` callback using `prev` parameter.

- Area: `src/components/shopping-lists/detail-header-slots.tsx`
- Why: `<Link to={ShoppingListsRoute.fullPath}>` on lines 157, 202 may need adjustment if `fullPath` changes format.
- Evidence: `src/components/shopping-lists/detail-header-slots.tsx:157,202` -- `Link to={ShoppingListsRoute.fullPath}`.

- Area: `src/routes/shopping-lists/$listId.tsx`
- Why: `navigate({ to: ShoppingListsRoute.fullPath })` on line 113 may need adjustment.
- Evidence: Line 113 -- `to: ShoppingListsRoute.fullPath`.

- Area: `src/components/layout/sidebar-nav.ts`
- Why: Uses `to: '/parts'`, `to: '/shopping-lists'` etc. without trailing slashes; may need updating.
- Evidence: `src/components/layout/sidebar-nav.ts:10-16` -- navigation item paths.

### Task 2: TanStack Query mutation callback signatures

- Area: `src/hooks/use-kit-shopping-list-links.ts`
- Why: 12 callback invocations (`onSuccess`, `onError`, `onSettled`) across 4 mutation wrappers need argument count updated.
- Evidence: Lines 134, 137, 140, 165, 168, 171, 203, 206, 209, 226, 229, 232 -- all pass 3 or 4 args.

- Area: `src/hooks/use-shopping-lists.ts`
- Why: 18 `onSuccess` callback invocations across mutation wrappers need argument count updated.
- Evidence: Lines 978, 993, 1093, 1113, 1146, 1164, 1204, 1233, 1273, 1302, 1404, 1488, 1559, 1578, 1614, 1635, 1703, 1752 -- all `options?.onSuccess?.(data, variables, context)`.

### Task 3: Remove infrastructure tests

- Area: `tests/e2e/auth/auth.spec.ts` -- Infrastructure: Auth flow tests.
- Area: `tests/e2e/auth/AuthPage.ts` -- Infrastructure: Auth page object.
- Area: `tests/e2e/deployment/deployment-banner.spec.ts` -- Infrastructure: Deployment banner.
- Area: `tests/e2e/deployment/shared-worker-version-sse.spec.ts` -- Infrastructure: SharedWorker SSE.
- Area: `tests/e2e/sse/task-events.spec.ts` -- Infrastructure: SSE task events.
- Area: `tests/e2e/app-shell/toast-display.spec.ts` -- Infrastructure: Toast notifications.
- Area: `tests/e2e/shell/navigation.spec.ts` -- Infrastructure: Sidebar navigation.
- Area: `tests/e2e/shell/mobile-menu.spec.ts` -- Infrastructure: Mobile menu.
- Area: `tests/e2e/dialogs/keyboard-navigation.spec.ts` -- Infrastructure: Dialog keyboard a11y.
- Area: `tests/e2e/ui/tooltip.spec.ts` -- Infrastructure: Tooltip display.
- Area: `tests/e2e/parallel/worker-isolation.spec.ts` -- Infrastructure: Playwright worker isolation.
- Area: `tests/e2e/test-infrastructure.spec.ts` -- Infrastructure: Test event instrumentation validation.
- Area: `tests/e2e/workflows/instrumentation-snapshots.spec.ts` -- Infrastructure: Instrumentation snapshots.
- Why: All 13 files (12 listed in the refactoring doc plus `instrumentation-snapshots.spec.ts`) now live in the template mother project and are redundant.
- Evidence: Refactoring doc table lists each file and reason for removal.

- Area: Empty directories after removal
- Why: `auth/`, `deployment/`, `sse/`, `app-shell/`, `shell/`, `dialogs/`, `ui/`, `parallel/` directories will be empty after their contents are removed.
- Evidence: Each directory contains only infrastructure test files (verified by listing).

- Area: `.gitkeep` files
- Why: `tests/e2e/.gitkeep` and `tests/e2e/specific/.gitkeep` should be removed since the directories will still contain domain test files (or be removed entirely).
- Evidence: `find` output lists both `.gitkeep` files.

### Task 4: Fix selectors.ts re-export pattern

- Area: `tests/support/selectors.ts`
- Why: Restore to template-owned form by removing domain selector re-exports.
- Evidence: `tests/support/selectors.ts:9-29` -- imports and re-exports `partsSelectors`, `typesSelectors`, `boxesSelectors`, `sellersSelectors` from `selectors-domain.ts`.

- Area: `tests/support/page-objects/part-selector-harness.ts`
- Why: Currently imports `selectors` from `../selectors` and uses `selectors.parts.selector.*`. Must switch to importing `partsSelectors` from `../selectors-domain`.
- Evidence: `tests/support/page-objects/part-selector-harness.ts:4` -- `import { selectors } from '../selectors'`.
- Evidence: Lines 15, 19, 23, 27, 31, 35 -- uses `selectors.parts.selector.*`.

- Area: `tests/smoke.spec.ts`
- Why: Imports `selectors` from `./support/selectors` but only uses `selectors.common.loading` -- no domain selectors. This import stays valid after `selectors.ts` is restored to template form.
- Evidence: `tests/smoke.spec.ts:2` -- `import { selectors } from './support/selectors'`; line 72 -- `selectors.common.loading`.

### Task 5: Move TypesPage.ts

- Area: `tests/e2e/types/TypesPage.ts`
- Why: Page object sitting in test directory; should be in `tests/support/page-objects/` like all other page objects.
- Evidence: File at `tests/e2e/types/TypesPage.ts`, all other page objects are in `tests/support/page-objects/`.

- Area: `tests/support/fixtures.ts`
- Why: Imports `TypesPage` from `../e2e/types/TypesPage`; path must update to `./page-objects/TypesPage` (or new filename).
- Evidence: `tests/support/fixtures.ts:15` -- `import { TypesPage } from '../e2e/types/TypesPage'`.

## 3) Data Model / Contracts

No data model or API contract changes. This refactoring only touches type-level compatibility and file organization. All API payloads, query keys, and domain models remain unchanged.

## 4) API / Integration Surface

No API surface changes. The mutation callback signature fix (Task 2) only adjusts how callback arguments are forwarded within custom hook wrappers. The underlying generated API hooks and their request/response contracts are unchanged.

## 5) Algorithms & UI Flows

### Task 1: Lockfile refresh and route path fix

- Flow: Dependency refresh and type error resolution
- Steps:
  1. Delete `pnpm-lock.yaml`
  2. Run `pnpm install` to resolve fresh dependency versions
  3. Run `pnpm exec tsr generate` to regenerate `src/routeTree.gen.ts` with the new TanStack Router
  4. Inspect the generated route IDs to determine trailing-slash convention
  5. Update hardcoded route paths in `part-list.tsx` `useNavigate({ from: ... })` and `navigate({ to: ... })` to match generated IDs
  6. Verify `ShoppingListsRoute.fullPath` resolves correctly; if it does, the `<Link>` usages in `detail-header-slots.tsx` and `$listId.tsx` need no manual change
  7. Check `sidebar-nav.ts` paths against the generated route tree
  8. Run `pnpm check` to confirm zero type errors
- Hotspots: The `search` callback in `navigate()` at `part-list.tsx:327,335` types `prev` as `never` when the route path doesn't match -- this is the root cause. Once the path matches, the type resolves.

### Task 2: Mutation callback signature update

- Flow: Update callback forwarding in hook wrappers
- Steps:
  1. After fresh install, run `pnpm check` to see which callback invocations fail type checking
  2. Check the TanStack Query changelog or migration guide for the exact new callback shape
  3. Update all `onSuccess`, `onError`, `onSettled` invocations in `use-kit-shopping-list-links.ts` (12 sites)
  4. Update all `onSuccess` invocations in `use-shopping-lists.ts` (18 sites)
  5. Run `pnpm check` to confirm zero errors in these files
- Hotspots: The pattern is mechanical -- every `mutateOptions?.onSuccess?.(data, variables, context)` likely needs a 4th argument or signature adjustment. The exact fix must be determined from the error messages after fresh install.

### Task 3: Infrastructure test removal

- Flow: Delete files and clean up empty directories
- Steps:
  1. Delete the 13 infrastructure files: the 12 test files listed in the refactoring doc table, plus `instrumentation-snapshots.spec.ts` (also remove the `AuthPage.ts` page object in `tests/e2e/auth/` since it is only consumed by `auth.spec.ts`)
  2. Remove now-empty directories: `tests/e2e/auth/`, `tests/e2e/deployment/`, `tests/e2e/sse/`, `tests/e2e/app-shell/`, `tests/e2e/shell/`, `tests/e2e/dialogs/`, `tests/e2e/ui/`, `tests/e2e/parallel/`
  3. Remove `.gitkeep` files: `tests/e2e/.gitkeep`, `tests/e2e/specific/.gitkeep`
  4. Verify `tests/smoke.spec.ts` and `tests/e2e/setup/reset.spec.ts` are kept
  5. Run Playwright to confirm remaining tests pass

### Task 4: Selector import cleanup

- Flow: Switch page objects from `selectors.ts` re-exports to direct `selectors-domain.ts` imports
- Steps:
  1. In `part-selector-harness.ts`, replace `import { selectors } from '../selectors'` with `import { partsSelectors } from '../selectors-domain'`
  2. Update all `selectors.parts.*` references in `part-selector-harness.ts` to `partsSelectors.*` (6 usage sites)
  3. Confirm `smoke.spec.ts` only uses `selectors.common` -- no changes needed there
  4. Restore `selectors.ts` to template form: remove the `import` of domain selectors and remove the domain entries (`parts`, `types`, `boxes`, `sellers`) from the `selectors` object
  5. Run `pnpm check` to confirm no broken imports

### Task 5: Move TypesPage.ts

- Flow: Relocate page object and update import paths
- Steps:
  1. Move `tests/e2e/types/TypesPage.ts` to `tests/support/page-objects/TypesPage.ts`
  2. Update `tests/support/fixtures.ts` import from `'../e2e/types/TypesPage'` to `'./page-objects/TypesPage'`
  3. Verify no other files import `TypesPage` from the old location
  4. Run `pnpm check` and Playwright to confirm

## 6) Derived State & Invariants

- Derived value: Route path matching
  - Source: `src/routeTree.gen.ts` -- generated route IDs determine valid paths
  - Writes / cleanup: All hardcoded `from`/`to` paths in components must match generated IDs for TypeScript to resolve `search` callback types
  - Guards: `pnpm check` enforces type safety; mismatched paths produce `never` types
  - Invariant: Every `useNavigate({ from })` and `navigate({ to })` path must exactly match a registered route ID in the generated tree
  - Evidence: `src/components/parts/part-list.tsx:36` and `src/routeTree.gen.ts:56-59`

- Derived value: Mutation callback argument arity
  - Source: TanStack Query `mutate()` options type definitions
  - Writes / cleanup: All forwarded callbacks must match the expected parameter count
  - Guards: `pnpm check` enforces type safety
  - Invariant: The number of arguments passed to `onSuccess`, `onError`, `onSettled` must match the type definition from the installed TanStack Query version
  - Evidence: `src/hooks/use-kit-shopping-list-links.ts:132-140` and `src/hooks/use-shopping-lists.ts:976-978`

- Derived value: Selector import graph
  - Source: `tests/support/selectors.ts` and `tests/support/selectors-domain.ts`
  - Writes / cleanup: After cleanup, domain selectors are only accessible via direct `selectors-domain.ts` imports
  - Guards: TypeScript import resolution; `pnpm check`
  - Invariant: `selectors.ts` must not export domain-specific selectors to remain compatible with template updates
  - Evidence: `tests/support/selectors.ts:24-29` (current domain re-exports to remove)

## 7) State Consistency & Async Coordination

No runtime state changes. This refactoring is entirely compile-time (type fixes) and organizational (file moves/deletes). No query caches, React state, or instrumentation hooks are modified in behavior.

- Source of truth: TypeScript compiler and generated route tree
- Coordination: `pnpm check` validates all type constraints after changes
- Async safeguards: N/A -- no runtime behavior changes
- Instrumentation: No instrumentation changes; existing test events remain unchanged

## 8) Errors & Edge Cases

- Failure: Fresh `pnpm install` resolves a version with additional breaking changes beyond router paths and query callbacks
- Surface: `pnpm check` output
- Handling: Investigate errors one by one; the refactoring doc scopes to ~43 known errors, but additional issues may surface
- Guardrails: Run `pnpm check` iteratively after each fix category

- Failure: `pnpm exec tsr generate` produces different route IDs than expected
- Surface: `src/routeTree.gen.ts`
- Handling: Inspect the generated file and adjust hardcoded paths accordingly
- Guardrails: The refactoring doc advises checking the generated output before fixing paths

- Failure: Removing infrastructure tests breaks Playwright configuration or fixtures
- Surface: Playwright test run
- Handling: Infrastructure fixtures (`fixtures-infrastructure.ts`) should remain intact; only test files are removed
- Guardrails: Run full Playwright suite after removal

- Failure: A domain test file imports from a removed infrastructure test file or page object
- Surface: `pnpm check` or Playwright import errors
- Handling: The only infrastructure page object being removed is `AuthPage.ts`; grep confirms no domain tests import it
- Guardrails: TypeScript import resolution catches missing modules

## 9) Observability / Instrumentation

No instrumentation changes. Existing test events, `data-testid` attributes, and instrumentation hooks remain unchanged. The only test-related change is removing infrastructure test files -- the instrumentation they tested remains in the application code.

## 10) Lifecycle & Background Work

No lifecycle changes. No effects, listeners, timers, or subscriptions are modified.

## 11) Security & Permissions

Not applicable. No authentication, authorization, or data exposure changes.

## 12) UX / UI Impact

Not applicable. No user-visible changes. All modifications are type-level fixes and test infrastructure organization.

## 13) Deterministic Test Plan

- Surface: All remaining domain Playwright tests
- Scenarios:
  - Given all 5 refactoring tasks are complete, When `pnpm check` is run, Then zero type errors are reported
  - Given infrastructure tests are removed, When `pnpm playwright test` is run, Then all remaining domain tests pass
  - Given the lockfile is refreshed, When the dev server starts (`pnpm dev`), Then the application loads without runtime errors
- Instrumentation / hooks: No new selectors or events. Existing `data-testid` attributes and test event taxonomy unchanged.
- Gaps: No new Playwright specs are created -- this is a refactoring that preserves existing behavior. Validation is via `pnpm check` and running the existing suite.
- Evidence: `docs/contribute/testing/ci_and_execution.md` -- local run expectations.

## 14) Implementation Slices

- Slice: 1 -- Lockfile refresh and type error fixes (Tasks 1 + 2)
- Goal: Unblock current dependency versions; resolve all ~43 type errors
- Touches: `pnpm-lock.yaml`, `src/components/parts/part-list.tsx`, `src/components/shopping-lists/detail-header-slots.tsx`, `src/routes/shopping-lists/$listId.tsx`, `src/components/layout/sidebar-nav.ts`, `src/hooks/use-kit-shopping-list-links.ts`, `src/hooks/use-shopping-lists.ts`, `src/routeTree.gen.ts`
- Dependencies: Must complete before other slices since fresh dependency versions may affect type checking in remaining files.
- Verification: `pnpm check` passes with zero errors; `pnpm build` succeeds to confirm the Vite bundle is valid.

- Slice: 2 -- Remove infrastructure tests (Task 3)
- Goal: Clean up redundant test files; reduce test suite to domain-only
- Touches: 13 test files to delete (including `AuthPage.ts`), 8 empty directories to remove, 2 `.gitkeep` files to remove
- Dependencies: None (independent of Slice 1, but logically follows)
- Verification: `pnpm playwright test` -- all remaining tests pass.

- Slice: 3 -- Fix selector imports and move TypesPage (Tasks 4 + 5)
- Goal: Clean template/domain boundary in test selectors; consolidate page objects
- Touches: `tests/support/selectors.ts`, `tests/support/page-objects/part-selector-harness.ts`, `tests/e2e/types/TypesPage.ts` (move to `tests/support/page-objects/TypesPage.ts`), `tests/support/fixtures.ts`
- Dependencies: None. The `tests/e2e/types/` directory retains its domain spec files regardless of Task 3, so Task 5 is independent.
- Verification: `pnpm check` passes; `pnpm playwright test` -- all tests pass.

## 15) Risks & Open Questions

- Risk: Fresh dependency resolution introduces breaking changes beyond the ~43 known type errors
- Impact: Additional unplanned type fixes needed, extending scope
- Mitigation: Run `pnpm check` immediately after install to assess full error count; if significantly larger than expected, investigate whether a specific package caused the regression before proceeding

- Risk: TanStack Query callback signature changed more fundamentally than "add a 4th argument"
- Impact: Mechanical find-and-replace is insufficient; each mutation wrapper needs individual analysis
- Mitigation: Read the actual TypeScript error messages and TanStack Query changelog after fresh install to determine the exact new signature

- Risk: A domain test has an implicit dependency on a removed infrastructure test (e.g. shared state setup)
- Impact: Domain test fails after infrastructure test removal
- Mitigation: Run full Playwright suite after removal; infrastructure tests are independent by design (they test generic UI, not domain setup)

- Risk: Route tree regeneration changes IDs in an unexpected direction (e.g. removing trailing slashes instead of adding)
- Impact: The fix direction for hardcoded paths would be opposite to what the refactoring doc suggests
- Mitigation: Always inspect `src/routeTree.gen.ts` after regeneration before making path fixes; the plan accounts for either direction

## 16) Confidence

Confidence: High -- All five tasks are well-scoped mechanical refactorings with clear patterns, bounded file sets, and deterministic verification (`pnpm check` + Playwright suite). The research confirms the affected files and import graphs match the refactoring doc.
