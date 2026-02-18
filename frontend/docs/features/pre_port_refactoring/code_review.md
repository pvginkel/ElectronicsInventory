# Code Review: Pre-Port Refactoring (Third Pass)

## 1) Summary & Decision

**Readiness**

The implementation covers all five planned refactoring tasks with high fidelity to the plan. The lockfile refresh, TanStack Router path fixes, TanStack Query callback signature updates, infrastructure test removal, selector import cleanup, and TypesPage relocation are all mechanically correct and consistent with the new dependency versions. One unplanned change (`form.tsx` event type) is a direct consequence of the React 19 type update and is correct. Documentation referencing the old TypesPage path is stale but non-blocking. The change is clean, well-scoped, and introduces no runtime behavior changes.

**Decision**

`GO` -- All five tasks are implemented correctly, the callback signature changes match the installed TanStack Query v5.90.20 type definitions, route paths align with the regenerated route tree, and infrastructure test removal is complete without orphaned imports.

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Task 1 (lockfile + route paths)` <-> `pnpm-lock.yaml` -- Lockfile regenerated; dependency versions bumped (React 19.1.x -> 19.2.x, TanStack packages updated). `src/components/parts/part-list.tsx:36` -- `useNavigate({ from: '/parts/' })` now matches `FileRoutesByFullPath` entry `/parts/` in `src/routeTree.gen.ts:134`. Navigate `to` values use `/parts` and `/shopping-lists` (no trailing slash) matching `FileRoutesByTo` entries at `src/routeTree.gen.ts:150-154`.
- `Task 1 (ShoppingListsRoute removal)` <-> `src/components/shopping-lists/detail-header-slots.tsx:156,201` and `src/routes/shopping-lists/$listId.tsx:112` -- Replaced `ShoppingListsRoute.fullPath` with string literal `'/shopping-lists'`, removing the cross-route import. This is consistent with the `FileRoutesByTo` type.
- `Task 2 (mutation callbacks)` <-> `src/hooks/use-kit-shopping-list-links.ts` -- 12 callback sites updated (4 wrappers x 3 callbacks each). `onSuccess` and `onError` now take `(data, variables, onMutateResult, context)` (4 args); `onSettled` takes `(data, error, variables, onMutateResult, context)` (5 args). Matches `MutateOptions` signature at `@tanstack/query-core` line 1218-1222.
- `Task 2 (mutation callbacks)` <-> `src/hooks/use-shopping-lists.ts` -- 18 `onSuccess` callback sites updated (36 changed lines = 18 definitions + 18 invocations). All now pass `onMutateResult` as the 3rd arg before `context`.
- `Task 3 (infrastructure test removal)` <-> 13 files deleted: `auth/auth.spec.ts`, `auth/AuthPage.ts`, `deployment/deployment-banner.spec.ts`, `deployment/shared-worker-version-sse.spec.ts`, `sse/task-events.spec.ts`, `app-shell/toast-display.spec.ts`, `shell/navigation.spec.ts`, `shell/mobile-menu.spec.ts`, `dialogs/keyboard-navigation.spec.ts`, `ui/tooltip.spec.ts`, `parallel/worker-isolation.spec.ts`, `test-infrastructure.spec.ts`, `workflows/instrumentation-snapshots.spec.ts`. Empty directories (`auth/`, `deployment/`, `sse/`, `app-shell/`, `shell/`, `dialogs/`, `ui/`, `parallel/`) removed. Both `.gitkeep` files removed.
- `Task 3 (borderline files kept)` <-> `tests/smoke.spec.ts` and `tests/e2e/setup/reset.spec.ts` confirmed present.
- `Task 4 (selectors)` <-> `tests/support/selectors.ts` -- Domain re-exports removed; file now only exports `common` selectors and `buildSelector()`. `tests/support/page-objects/part-selector-harness.ts:4` -- imports `partsSelectors` directly from `../selectors-domain`. All 6 usage sites updated from `selectors.parts.selector.*` to `partsSelectors.selector.*`.
- `Task 5 (TypesPage move)` <-> `tests/support/page-objects/TypesPage.ts` exists with correct content. `tests/support/fixtures.ts:15` -- import updated to `'./page-objects/TypesPage'`. No other files reference the old path.

**Gaps / deviations**

- `plan.md:106-107 (sidebar-nav.ts)` -- Plan listed this as a potential area to update. No change was made, which is correct: `sidebar-nav.ts` uses `to` paths without trailing slashes, matching `FileRoutesByTo`. Not a gap; the plan accounted for this possibility.
- `Unplanned change: form.tsx` -- `src/components/primitives/form.tsx:14` changed `React.FormEvent<HTMLFormElement>` to `React.SubmitEvent<HTMLFormElement>`. This was not listed in the plan's 5 tasks but is a direct consequence of the React 19 type update (`@types/react` 19.1.x -> 19.2.x). The `onSubmit` prop type changed from `FormEventHandler` to `SubmitEventHandler`, requiring the cast update. The new type is correct per `@types/react/index.d.ts` and aligns with the prop definition.
- `Documentation references` -- `docs/contribute/testing/playwright_developer_guide.md:57` still references `tests/e2e/types/TypesPage.ts` and `docs/contribute/testing/selector_patterns.md:26` still references the old path. These are stale but do not affect code correctness. The plan's scope explicitly excluded documentation updates.

## 3) Correctness -- Findings (ranked)

No Blocker or Major findings.

- Title: `Minor -- Stale documentation references to old TypesPage path`
- Evidence: `docs/contribute/testing/playwright_developer_guide.md:57` -- `types -- Page object for the Types feature (tests/e2e/types/TypesPage.ts).` Also `docs/contribute/testing/selector_patterns.md:26` -- `// tests/e2e/types/TypesPage.ts`
- Impact: Contributors reading these docs will be pointed to a non-existent file location. No build or runtime impact.
- Fix: Update both references to `tests/support/page-objects/TypesPage.ts`. Can be done in a follow-up.
- Confidence: High

- Title: `Minor -- form.tsx type change not covered by plan`
- Evidence: `src/components/primitives/form.tsx:14` -- `(e: React.SubmitEvent<HTMLFormElement>)` (was `React.FormEvent<HTMLFormElement>`)
- Impact: None negative. The change is correct and necessary after the `@types/react` bump. `React.SubmitEvent` is the proper type for `onSubmit` handlers in the updated React 19 types. `React.SubmitEvent<T>` extends `SyntheticEvent<T, NativeSubmitEvent>`, and the `onSubmit` prop is now typed as `SubmitEventHandler<T>`. This is type-compatible everywhere `FormEvent` was used since `SubmitEvent` is a subtype of the `SyntheticEvent` family.
- Fix: No fix needed. Consider noting this in the plan's requirements verification for traceability.
- Confidence: High

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering hotspots. The changes are purely mechanical and minimal. One observation:

- Hotspot: String literal route paths vs. programmatic route references
- Evidence: `src/components/shopping-lists/detail-header-slots.tsx:156` -- `<Link to={'/shopping-lists'} ...>`. Previously used `ShoppingListsRoute.fullPath` which was type-safe against route changes.
- Suggested refactor: None immediately. The string literal `'/shopping-lists'` is type-checked against `FileRoutesByTo`, so TanStack Router's type system still catches mismatches. The `Route.fullPath` approach provided an extra layer of indirection but was functionally equivalent. Removing the cross-route import is the cleaner pattern for the template port.
- Payoff: Reduced import coupling between route modules. The type safety from `FileRoutesByTo` is sufficient.

## 5) Style & Consistency

- Pattern: Consistent naming of the new callback parameter
- Evidence: All changed files use `onMutateResult` as the parameter name (e.g., `src/hooks/use-kit-shopping-list-links.ts:132` -- `onSuccess: (data, variables, onMutateResult, context) => {`). This matches the TanStack Query type definition naming at `@tanstack/query-core` (`onMutateResult: TOnMutateResult`).
- Impact: Positive. Using the same name as the type definition improves readability and grep-ability.
- Recommendation: None; this is well done.

- Pattern: Route path style consistency
- Evidence: `src/components/parts/part-list.tsx:36` uses `from: '/parts/'` (trailing slash, matching `FileRoutesByFullPath`), while `part-list.tsx:326` uses `to: '/parts'` (no trailing slash, matching `FileRoutesByTo`). The different conventions for `from` vs `to` come from TanStack Router's type system where `from` keys on `fullPath` and `to` keys on the `to` union.
- Impact: Could confuse contributors unfamiliar with TanStack Router's distinction between `fullPath` and `to` types.
- Recommendation: A brief inline comment at the `useNavigate({ from: '/parts/' })` site explaining the trailing-slash convention for `from` would help. Not blocking.

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: All changes are type-level or organizational; no runtime behavior is modified.
- Scenarios: No new test scenarios are needed. The plan correctly identifies that validation is via `pnpm check` + running the existing Playwright suite.
- Hooks: No instrumentation changes. Existing `data-testid` attributes and test events remain unchanged.
- Gaps: None for the scope of this change. The 13 removed infrastructure tests lived in the template and tested template concerns (auth flows, toast display, SSE, navigation, tooltips, dialogs, etc.). Domain tests are unaffected.
- Evidence: `tests/smoke.spec.ts` and `tests/e2e/setup/reset.spec.ts` are retained. All domain test directories (`parts/`, `types/`, `boxes/`, `sellers/`, `shopping-lists/`, `kits/`, `workflows/`, `pick-lists/`, `specific/`) are intact.

## 7) Adversarial Sweep (must attempt >= 3 credible failures or justify none)

- Checks attempted:
  1. **Route path mismatch causing `never` type on search callbacks** -- Verified that `from: '/parts/'` in `part-list.tsx:36` matches the `FileRoutesByFullPath` entry `'/parts/'` at `routeTree.gen.ts:134`. When `from` matches, the `search` callback parameter resolves from `never` to the actual search type. The `to: '/parts'` values at lines 326/334 match `FileRoutesByTo` at `routeTree.gen.ts:152`. No `never` type leaks.
  2. **Mutation callback argument mismatch at runtime** -- The old code forwarded `(data, variables, context)` to `options?.onSuccess?.(data, variables, context)`. The new code forwards `(data, variables, onMutateResult, context)` to `options?.onSuccess?.(data, variables, onMutateResult, context)`. If a caller passes `onSuccess` expecting the old 3-arg signature, the extra `context` argument would be silently ignored (JavaScript ignores extra positional args). However, any caller expecting `context` as the 3rd arg would receive `onMutateResult` instead. Checked all callers: the generated API hooks create these `MutateOptions` objects, and their types are now `(data, variables, onMutateResult, context)`, so callers must use the new signature. TypeScript enforces this at compile time. No runtime risk.
  3. **Cross-module import breakage from selector cleanup** -- `smoke.spec.ts:2` imports `{ selectors }` from `./support/selectors` and uses only `selectors.common.loading` at line 72. After removing domain re-exports from `selectors.ts`, the `common` property is still exported. No breakage. `part-selector-harness.ts:4` now imports `{ partsSelectors }` from `../selectors-domain` -- verified that `selectors-domain.ts` exports `partsSelectors`.
  4. **Orphaned imports from deleted files** -- Checked that no remaining test file imports from any deleted infrastructure test or from `AuthPage.ts`. The only import that changed was `fixtures.ts` which referenced `TypesPage` (moved, not deleted). Grep confirms no remaining references to old paths.
  5. **form.tsx SubmitEvent breaking onSubmit callers** -- `React.SubmitEvent<HTMLFormElement>` is assignable where `React.FormEvent<HTMLFormElement>` was used because both are `SyntheticEvent` subtypes. The `onSubmit` prop on `<form>` now expects `SubmitEventHandler<T> = EventHandler<SubmitEvent<T>>`. The wrapper function in `form.tsx:14` correctly receives a `SubmitEvent` and passes it to the parent `onSubmit` (which also expects a `SubmitEvent`). Callers that typed their handlers as `FormEvent` will get a type error from the parent type definition, not from this wrapper. This is correct behavior -- the React types enforce the new event type globally.

- Evidence:
  - `src/routeTree.gen.ts:122-159` -- `FileRoutesByFullPath` and `FileRoutesByTo` type maps
  - `src/components/parts/part-list.tsx:36,326,334` -- `from`/`to` path usage
  - `@tanstack/query-core` `hydration-BlEVG2Lp.d.ts:1218-1222` -- `MutateOptions` callback types
  - `tests/support/selectors.ts:16-30` -- cleaned selectors object
  - `tests/smoke.spec.ts:2,72` -- only uses `selectors.common`
  - `@types/react/index.d.ts` -- `SubmitEvent<T>` and `SubmitEventHandler<T>` definitions
- Why code held up: All changes are type-driven by the new dependency versions and verified against the actual installed type definitions.

## 8) Invariants Checklist (table)

- Invariant: Every `useNavigate({ from })` path must exactly match a `FileRoutesByFullPath` entry in `routeTree.gen.ts`
  - Where enforced: TypeScript strict mode via TanStack Router type generation (`src/routeTree.gen.ts:122-141`)
  - Failure mode: If `from` does not match, `search` callback parameter becomes `never`, causing type errors at all `navigate({ search: (prev) => ... })` call sites
  - Protection: `pnpm check` catches mismatches at build time. The only `from` usage is `part-list.tsx:36` with `'/parts/'`.
  - Evidence: `src/routeTree.gen.ts:134` -- `'/parts/': typeof PartsIndexRoute`

- Invariant: Mutation callback invocations must match the `MutateOptions` signature from the installed TanStack Query version
  - Where enforced: TypeScript strict mode via `@tanstack/query-core` type definitions
  - Failure mode: If argument count/types mismatch, TypeScript reports errors at each call site
  - Protection: `pnpm check` validates all 30 changed callback sites (12 in `use-kit-shopping-list-links.ts` + 18 in `use-shopping-lists.ts`)
  - Evidence: `@tanstack/query-core` `hydration-BlEVG2Lp.d.ts:1218-1222` -- `MutateOptions` interface

- Invariant: `selectors.ts` must not export domain-specific selectors to remain compatible with template updates
  - Where enforced: Code review and the module comment at `tests/support/selectors.ts:1-7`
  - Failure mode: If domain selectors are re-added to `selectors.ts`, future template re-ports will produce merge conflicts
  - Protection: The file comment documents the pattern: "Domain-specific selectors live in selectors-domain.ts. Page objects should import from selectors-domain.ts directly."
  - Evidence: `tests/support/selectors.ts:5-6` -- ownership comment

- Invariant: All page objects must reside in `tests/support/page-objects/`
  - Where enforced: Convention documented in `tests/support/fixtures.ts:1-10` comment and `docs/contribute/testing/playwright_developer_guide.md:185`
  - Failure mode: If page objects are scattered across feature test directories, imports become inconsistent and the template/domain boundary blurs
  - Protection: `fixtures.ts` imports all page objects from `./page-objects/` -- any misplaced file would require an inconsistent import path
  - Evidence: `tests/support/fixtures.ts:15-25` -- all page object imports use `./page-objects/` prefix

## 9) Questions / Needs-Info

No blocking questions. All five tasks are unambiguous mechanical changes verified against the installed dependency types.

- Question: Was `pnpm check` run after all changes and did it pass with zero errors?
- Why it matters: This is the primary verification gate per the plan. The type changes are correct by inspection against the installed type definitions, but a clean `pnpm check` run confirms no overlooked errors.
- Desired answer: Confirmation that `pnpm check` passes, or the output if it does not.

## 10) Risks & Mitigations (top 3)

- Risk: Runtime behavioral change in TanStack Query's mutation lifecycle that the type signature change masks (e.g., `onMutateResult` carries different semantics than the old `context`)
- Mitigation: The `onMutateResult` parameter is the return value of the `onMutate` callback, which was previously the 3rd `context` parameter under a different name. TanStack Query renamed it for clarity but the semantics are the same. Verify by running the full Playwright suite to confirm mutations behave correctly end-to-end.
- Evidence: `@tanstack/query-core` `hydration-BlEVG2Lp.d.ts:1203` -- `onMutate?: (variables: TVariables, context: MutationFunctionContext) => Promise<TOnMutateResult> | TOnMutateResult`; the 4th type param was renamed from `TContext` to `TOnMutateResult`

- Risk: A removed infrastructure test was the only coverage for a domain-relevant regression (e.g., toast display after a domain mutation)
- Mitigation: Infrastructure tests tested generic template behavior (auth flows, SSE reconnect, tooltip display, dialog keyboard navigation). Domain-specific toast assertions exist in domain test specs. The `smoke.spec.ts` and workflow tests continue to exercise the app shell. Running the full Playwright suite after removal confirms no gaps.
- Evidence: `tests/e2e/workflows/end-to-end.spec.ts` retained; domain specs in `types/`, `parts/`, etc. retained

- Risk: React 19.2.x introduces additional breaking type changes beyond `SubmitEvent` that surface in components not yet exercised
- Mitigation: `pnpm check` covers the entire source tree. If additional type errors exist, they will surface there. The `form.tsx` change is the only one that appeared, suggesting the update is otherwise compatible.
- Evidence: `pnpm-lock.yaml` diff shows React 19.1.1 -> 19.2.4, `@types/react` 19.1.11 -> 19.2.14

## 11) Confidence

Confidence: High -- All five planned tasks are implemented correctly with changes that match the installed dependency type definitions. The single unplanned change (form.tsx) is a correct and necessary consequence of the React type update. No runtime behavior is altered. Verification depends on `pnpm check` passing and Playwright suite remaining green.
