# Plan Review -- Pre-Port Refactoring (Third Pass)

## 1) Summary & Decision

**Readiness**

The plan is well-structured and covers five clearly-scoped mechanical refactoring tasks with thorough research, accurate file maps, and evidence-backed claims. The research log demonstrates genuine investigation of the codebase. The primary weakness is that two of the five tasks (lockfile refresh and mutation callback signatures) cannot be fully specified until after `pnpm install` runs, making parts of the plan inherently discovery-dependent. However, the plan acknowledges this explicitly and provides a reasonable strategy for handling it. A few minor factual issues and one gap in the file map need addressing.

**Decision**

`GO-WITH-CONDITIONS` -- The plan is ready for implementation with the conditions noted in the adversarial sweep. The discovery-dependent nature of Tasks 1 and 2 is an acceptable and acknowledged constraint for this type of refactoring work.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- All 17 required headings (0 through 16) are present. The User Requirements Checklist (Section 1a) is included. The research log (Section 0) is thorough. Evidence is quoted with `path:line` references throughout.
- `docs/product_brief.md` -- Pass -- The plan explicitly notes no product-level behavior changes (`plan.md:53` "Changing any runtime behavior"), which is correct for a type-level and organizational refactoring.
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:111-117` correctly identifies the custom hook wrapping pattern for mutations described in `application_overview.md:33-34` (custom hooks adapt API responses). The mutation callback changes are scoped to the right layer.
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:306-313` acknowledges that no new Playwright specs are needed since no behavior changes. The plan correctly identifies that validation is via the existing suite. The page object convention (`tests/support/page-objects/`) cited in `plan.md:163-164` aligns with the Playwright guide's fixtures section (`playwright_developer_guide.md:57`).
- `docs/contribute/testing/ci_and_execution.md` -- Pass -- `plan.md:313` references the local run expectations. The verification steps in Section 14 (`pnpm check` and `pnpm playwright test`) match `ci_and_execution.md:28-33`.

**Fit with codebase**

- `src/components/parts/part-list.tsx` -- `plan.md:93-95` -- Confirmed. Line 36 uses `useNavigate({ from: '/parts' })` and lines 326, 334 use `navigate({ to: '/parts', ... })`. The route tree at `routeTree.gen.ts:56-59` shows `/parts/` with trailing slash, confirming the type mismatch claim.
- `src/components/layout/sidebar-nav.ts` -- `plan.md:105-107` -- Confirmed. Lines 10-16 use paths without trailing slashes (`/parts`, `/shopping-lists`, etc.). These will likely need adjustment after regeneration, as the plan notes.
- `tests/support/selectors.ts` -- `plan.md:148-154` -- Confirmed. The file currently re-exports domain selectors at lines 24-29. Only `part-selector-harness.ts` consumes domain selectors through this path; `smoke.spec.ts` uses only `selectors.common`.
- `tests/support/fixtures.ts` -- `plan.md:166-168` -- Confirmed. Line 15 imports `TypesPage` from `'../e2e/types/TypesPage'`. This is the only consumer.
- `tests/e2e/auth/` -- `plan.md:121-122,285` -- Confirmed. The `auth/` directory contains both `AuthPage.ts` and `auth.spec.ts`. `AuthPage` is only imported by `auth.spec.ts` (which is being removed), so removing both is safe.

## 3) Open Questions & Ambiguities

- Question: What is the exact file count for infrastructure test removal -- 12 or 13?
- Why it matters: `plan.md:42` says "Remove 12 infrastructure test files" and the checklist at `plan.md:70` says "Remove 12 infrastructure test files listed in the refactoring doc." But `plan.md:134` says "All 13 files (12 listed in the refactoring doc plus `instrumentation-snapshots.spec.ts`)." The Steps section at `plan.md:209` says "Delete the 12 infrastructure test files listed in the refactoring doc table, plus `instrumentation-snapshots.spec.ts`." The intent is clear (remove all infrastructure files), but the count is inconsistently stated. `plan.md:325` hedges with "12-13 test files to delete."
- Needed answer: Settle on the exact count (13) in the scope section and checklist to avoid implementer confusion. The research log at `plan.md:19` already identified `instrumentation-snapshots.spec.ts` as a removal target.

- Question: Does the `auth/` directory removal also include `AuthPage.ts`, or just spec files?
- Why it matters: The file map at `plan.md:121-122` lists `auth.spec.ts` and `AuthPage.ts` separately, which is correct. But the Steps at `plan.md:209` say "Delete the 12 infrastructure test files" without explicitly listing the page object. If the implementer interprets "test files" as "spec files only," `AuthPage.ts` could be left as an orphan.
- Needed answer: Research confirms `AuthPage.ts` is only consumed by `auth.spec.ts`. The plan already notes this at `plan.md:285`. The steps should explicitly list `AuthPage.ts` as a deletion target alongside the spec file, or clarify that directory removal handles it implicitly.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: No new or changed user-visible behavior
- Scenarios:
  - Given all refactoring tasks are complete, When `pnpm check` is run, Then zero type errors are reported (`plan.md:308`)
  - Given infrastructure tests are removed, When `pnpm playwright test` is run, Then all remaining domain tests pass (`plan.md:309`)
  - Given the lockfile is refreshed, When the dev server starts, Then the application loads without runtime errors (`plan.md:310`)
- Instrumentation: No new selectors or events required. Existing `data-testid` attributes and test event taxonomy are unchanged (`plan.md:311`).
- Backend hooks: No new factories or API helpers needed. Existing test data seeding is unaffected.
- Gaps: None. This is a refactoring with no behavior changes; the existing suite serves as the regression gate. The plan explicitly justifies this at `plan.md:312`.
- Evidence: `plan.md:304-313`, `docs/contribute/testing/ci_and_execution.md:28-33`

## 5) Adversarial Sweep

**Major -- File count inconsistency in scope (12 vs 13)**

**Evidence:** `plan.md:42` -- "Remove 12 infrastructure test files"; `plan.md:134` -- "All 13 files (12 listed in the refactoring doc plus `instrumentation-snapshots.spec.ts`)"

**Why it matters:** An implementer following the scope section or checklist may miss `instrumentation-snapshots.spec.ts`, leaving an orphaned infrastructure test in the domain `workflows/` directory that would be confusing during the re-port.

**Fix suggestion:** Update `plan.md:42` to "Remove 13 infrastructure test files (12 from the refactoring doc plus `instrumentation-snapshots.spec.ts`)" and update checklist item at `plan.md:70` to match. Also update `plan.md:325` from "12-13 test files" to "13 test files."

**Confidence:** High

---

**Minor -- sidebar-nav.ts paths may not need changes**

**Evidence:** `plan.md:105-107` -- "Uses `to: '/parts'`, `to: '/shopping-lists'` etc. without trailing slashes; may need updating." TanStack Router's `<Link>` and navigation typically resolve paths with fuzzy matching for trailing slashes when using the `to` prop.

**Why it matters:** The plan hedges with "may need updating" but does not specify a test to determine whether sidebar navigation actually breaks. TanStack Router's `Link` component often normalizes trailing slashes, so this may produce zero type errors despite the mismatch.

**Fix suggestion:** No plan change needed. The implementer should let `pnpm check` determine whether these paths produce type errors. The plan already advises inspecting the generated route tree first (`plan.md:188`). The hedging is appropriate here.

**Confidence:** Medium

---

**Minor -- Task 5 dependency on Task 3 is stated but not strictly necessary**

**Evidence:** `plan.md:332` -- "Task 3 should complete first so `TypesPage.ts` is moved from a clean `types/` directory."

**Why it matters:** The `tests/e2e/types/` directory contains 6 domain spec files alongside `TypesPage.ts`. After Task 3 (infrastructure test removal), the `types/` directory still has all its domain test files -- it does not become "clean" in any meaningful sense. Task 5 simply moves one file and updates one import. There is no actual dependency on Task 3.

**Fix suggestion:** Update `plan.md:332` to clarify that Task 5 has no hard dependency on Task 3. The `types/` directory retains its domain spec files regardless of infrastructure test removal. The current wording implies the `types/` directory is affected by Task 3, which is incorrect.

**Confidence:** High

---

**Minor -- Missing verification step: `pnpm build` or `pnpm dev` sanity check**

**Evidence:** `plan.md:310` mentions verifying the dev server starts, but neither Slice 1 (`plan.md:321`) nor the implementation steps include an explicit `pnpm build` or `pnpm dev` verification step.

**Why it matters:** `pnpm check` validates types and lint, and Playwright validates test behavior, but neither confirms the Vite build succeeds end-to-end. A build failure could surface from route tree changes that pass type-checking but produce runtime errors in the bundled output.

**Fix suggestion:** Add `pnpm build` as a verification step in Slice 1 alongside `pnpm check`. This is a minor addition since `pnpm check` catches most issues, but a build sanity check closes the gap noted in the test plan scenario at `plan.md:310`.

**Confidence:** Low

## 6) Derived-Value & State Invariants

- Derived value: Route path matching
  - Source dataset: `src/routeTree.gen.ts` -- generated route IDs (e.g., `/parts/`, `/shopping-lists/`)
  - Write / cleanup triggered: All hardcoded `from`/`to` paths in `part-list.tsx`, `sidebar-nav.ts`, and other navigation call sites must match generated IDs; mismatches produce `never` types that cascade to search callback parameters
  - Guards: `pnpm check` enforces type safety; TanStack Router's type system surfaces mismatches as compile errors
  - Invariant: Every `useNavigate({ from })` and `navigate({ to })` path must exactly match a registered route ID in the generated tree
  - Evidence: `plan.md:236-241`, `src/components/parts/part-list.tsx:36`, `src/routeTree.gen.ts:56-59`

- Derived value: Mutation callback argument arity
  - Source dataset: TanStack Query `mutate()` options type definitions from the installed package version
  - Write / cleanup triggered: All forwarded callbacks in `use-kit-shopping-list-links.ts` (12 sites) and `use-shopping-lists.ts` (18 sites) must match the expected parameter count
  - Guards: `pnpm check` enforces type safety; TypeScript strict mode catches arity mismatches
  - Invariant: The number and types of arguments passed to `onSuccess`, `onError`, `onSettled` must match the type definitions from the installed TanStack Query version
  - Evidence: `plan.md:243-248`, `src/hooks/use-kit-shopping-list-links.ts:132-140`, `src/hooks/use-shopping-lists.ts:976-978`

- Derived value: Selector import graph
  - Source dataset: `tests/support/selectors.ts` (template-owned) and `tests/support/selectors-domain.ts` (app-owned)
  - Write / cleanup triggered: After cleanup, `selectors.ts` exports only `common` selectors; domain selectors are only accessible via direct `selectors-domain.ts` imports. `part-selector-harness.ts` must be updated to import from `selectors-domain.ts`.
  - Guards: TypeScript import resolution; `pnpm check`; Playwright test execution validates selectors resolve correctly at runtime
  - Invariant: `selectors.ts` must not export domain-specific selectors to remain compatible with template updates
  - Evidence: `plan.md:250-255`, `tests/support/selectors.ts:24-29`, `tests/support/page-objects/part-selector-harness.ts:4`

All three derived values drive compile-time checks (not persistent writes), so no filtered-view-to-persistent-write risk exists.

## 7) Risks & Mitigations (top 3)

- Risk: Fresh dependency resolution introduces breaking changes beyond the ~43 known type errors, expanding scope unpredictably.
- Mitigation: Run `pnpm check` immediately after install to assess the total error count. If significantly larger than ~43, investigate the changelog of the offending package before proceeding. The plan accounts for this at `plan.md:337-339`.
- Evidence: `plan.md:337-339`

- Risk: TanStack Query callback signature changed more fundamentally than a simple arity adjustment, requiring per-mutation-wrapper analysis rather than mechanical find-and-replace.
- Mitigation: Read the actual TypeScript error messages and the TanStack Query changelog after fresh install. The plan acknowledges this uncertainty at `plan.md:341-343` and defers the exact fix to post-install discovery.
- Evidence: `plan.md:341-343`, `src/hooks/use-kit-shopping-list-links.ts:132-140`

- Risk: Removing infrastructure tests breaks Playwright configuration or shared fixtures that have implicit dependencies on removed files.
- Mitigation: The infrastructure tests use their own fixtures (`fixtures-infrastructure.ts`) and page objects (`AuthPage.ts`). Domain tests import from `tests/support/fixtures.ts`, which does not reference any infrastructure spec files. A full Playwright suite run after removal confirms no breakage. The plan addresses this at `plan.md:279-286`.
- Evidence: `plan.md:279-286`, `tests/support/fixtures.ts:15` (only infrastructure-related import is `TypesPage` which is being moved, not removed)

## 8) Confidence

Confidence: High -- The plan is thorough, evidence-backed, and appropriately scoped. The discovery-dependent aspects (Tasks 1 and 2) are handled with a reasonable strategy of inspecting actual errors after `pnpm install`. The conditions identified in this review are minor and do not threaten implementability.
