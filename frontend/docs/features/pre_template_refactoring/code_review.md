# Code Review: Pre-Template Refactoring

## 1) Summary & Decision

**Readiness**

The change implements all eight behavior-preserving refactorings specified in the plan. It cleanly separates infrastructure from domain code across constants, sidebar navigation, CSS theming, provider composition, test fixtures, test selectors, and test-event types. The diff touches 46 files, with the bulk being mechanical import path updates. New files are well-structured with clear guidepost comments, and the split boundaries align with the plan's infrastructure/domain classification. No functional changes are introduced; the refactoring is purely structural.

**Decision**

`GO-WITH-CONDITIONS` -- One minor finding (circular value import in the selectors split) should be addressed to prevent future confusion, but it does not block shipping. All other refactorings are correctly implemented and match the plan.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md` Slice 1 (Constants & TopBar) -- `src/lib/consts.ts:1-7` defines `PROJECT_NAME`, `PROJECT_TITLE`, `PROJECT_DESCRIPTION`, and three port constants. `src/components/layout/top-bar.tsx:8` imports `PROJECT_TITLE` and `PROJECT_DESCRIPTION`, replacing hardcoded strings at lines 58 and 66.
- `plan.md` Slice 2 (Sidebar navigation) -- `src/components/layout/sidebar.tsx:11` exports `SidebarItem`, line 9 imports `navigationItems` from `./sidebar-nav`. `src/components/layout/sidebar-nav.ts:1-17` defines the extracted 7-item array with a `type` import back to `sidebar.tsx`.
- `plan.md` Slice 3 (CSS theme split) -- `src/index.css:123-124` adds `@import "./app-theme.css"`. `src/app-theme.css:1-84` contains the extracted `--electronics-*` custom properties, `category-*` utilities, `ai-glare` utility, and `glare-sweep` keyframes with correct layer wrapping.
- `plan.md` Slice 4 (Provider group extraction) -- `src/providers/core-providers.tsx`, `src/providers/auth-providers.tsx`, and `src/providers/sse-providers.tsx` each wrap their respective providers. `src/routes/__root.tsx:24-33` composes them in order: `CoreProviders > AuthProviders > SseProviders > AppShellFrame`.
- `plan.md` Slice 5 (Test-events relocation) -- `src/types/test-events.ts` is deleted. `src/lib/test/test-events.ts:1-162` is an identical copy. All 39+ import sites updated from `@/types/test-events` to `@/lib/test/test-events`. Three previously-relative imports (`tests/smoke.spec.ts`, `tests/e2e/setup/reset.spec.ts`, `tests/e2e/parallel/worker-isolation.spec.ts`) now use the `@/` alias for consistency.
- `plan.md` Slice 6 (Fixtures split) -- `tests/support/fixtures-infrastructure.ts:1-536` contains all infrastructure fixtures. `tests/support/fixtures.ts:1-155` extends `infrastructureFixtures` with app-specific page objects and AI mock fixtures. The `InfrastructureFixtures` type is exported at line 51.
- `plan.md` Slice 7 (Selectors split) -- `tests/support/selectors-domain.ts:1-155` contains `partsSelectors`, `typesSelectors`, `boxesSelectors`, `sellersSelectors`. `tests/support/selectors.ts:1-57` retains `testId()`, `buildSelector()`, `selectors.common`, and re-exports domain selectors. The unused `SelectorPattern` type is deleted.

**Gaps / deviations**

- `plan.md:430` specifies that `sidebar-nav.ts` should use `import type { SidebarItem }` to make the type-only nature explicit. The implementation at `src/components/layout/sidebar-nav.ts:7` correctly uses `import type { SidebarItem } from './sidebar'` -- this is correctly implemented.
- `plan.md:83-84` calls for `CoreProviders` to wrap `QueryClientProvider > ToastProvider > QuerySetup`, with `QuerySetup` placed after `ToastProvider`. The implementation at `src/providers/core-providers.tsx:31-38` nests them as `QueryClientProvider > ToastProvider > QuerySetup > children`. In the original code, `QuerySetup` was inside `DeploymentProvider` (deeper in the tree). The plan explicitly calls out that this reordering is intentional and safe because `QuerySetup`'s only dependency is `useToast()`, which is satisfied by `ToastProvider`. This is correctly handled.
- No missing deliverables found. All 8 refactorings and all 15 items from the user requirements checklist are addressed.

---

## 3) Correctness -- Findings (ranked)

- Title: `Minor` -- Circular value import between selectors.ts and selectors-domain.ts
- Evidence: `tests/support/selectors-domain.ts:8` -- `import { testId } from './selectors';` and `tests/support/selectors.ts:9-14` -- `import { partsSelectors, typesSelectors, boxesSelectors, sellersSelectors } from './selectors-domain';`
- Impact: Both files import runtime values from each other, creating a circular module dependency. In ESM, this works because `testId` is a simple function that will be initialized before `selectors-domain.ts` references it. However, it creates a fragile coupling where future modifications (e.g., adding top-level code that depends on an import from the other file) could trigger undefined-at-import bugs. This contrasts with the sidebar case where `sidebar-nav.ts` uses `import type`, which is erased at compile time.
- Fix: Either (a) extract `testId()` into a tiny standalone module (e.g., `tests/support/test-id.ts`) that both `selectors.ts` and `selectors-domain.ts` import from, breaking the cycle, or (b) duplicate the one-liner `testId` function in `selectors-domain.ts` to eliminate the import. Option (a) is cleaner.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

No over-engineering detected. The refactoring introduces the minimum number of new files and abstractions needed to achieve the infrastructure/domain split. Each new file serves a clear purpose:

- `consts.ts` is a single file with 6 constants -- no unnecessary abstraction.
- The three provider files (`core-providers.tsx`, `auth-providers.tsx`, `sse-providers.tsx`) are thin wrappers that compose existing providers without adding logic.
- The fixture and selector splits are mechanical extractions with no new abstractions introduced.

The guidepost comments in `fixtures.ts:1-10` are a welcome addition that explains the two-layer extension pattern.

---

## 5) Style & Consistency

- Pattern: Ownership annotations in file headers
- Evidence: `src/lib/consts.ts:1` -- `"App-owned"`, `src/components/layout/sidebar-nav.ts:2-3` -- `"App-owned"`, `tests/support/fixtures-infrastructure.ts:3` -- `"Template-owned"`, `tests/support/selectors.ts:3` -- `"Template-owned"`, `tests/support/selectors-domain.ts:3` -- `"App-owned"`
- Impact: Positive. The consistent `App-owned` / `Template-owned` annotations in file headers make the infrastructure/domain boundary immediately visible. This will help when the Copier template is created.
- Recommendation: Continue this pattern for any future files that straddle the template boundary.

- Pattern: Consistent use of `import type` for type-only imports
- Evidence: `src/components/layout/sidebar-nav.ts:7` -- `import type { SidebarItem } from './sidebar'`, `src/providers/auth-providers.tsx:7` -- `import type { ReactNode } from 'react'`, `src/providers/sse-providers.tsx:7` -- `import type { ReactNode } from 'react'`
- Impact: Positive. Type-only imports are used where appropriate, following TypeScript best practices and the plan's explicit guidance on the sidebar circular dependency.
- Recommendation: None.

- Pattern: ESLint disable comments scoped correctly after split
- Evidence: `tests/support/fixtures.ts:12` -- `/* eslint-disable react-hooks/rules-of-hooks */` (removed `no-empty-pattern`), `tests/support/fixtures-infrastructure.ts:10` -- `/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern */`
- Impact: Positive. The `no-empty-pattern` disable moved to the file that actually needs it (infrastructure fixtures with the `sseTimeout` fixture using `{}`).
- Recommendation: None.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: All refactored modules (constants, sidebar, CSS, providers, test infrastructure)
- Scenarios:
  - Given the refactoring is behavior-preserving, When the full Playwright suite runs, Then all existing tests pass without modification to test logic (only import paths change)
  - Given the CSS split, When pages with category colors or ai-glare render, Then styling is identical (existing visual-dependent tests exercise these paths)
  - Given the provider split, When the app loads, Then auth, SSE, toast, and query functionality work (exercised by auth, deployment, toast-display, and mutation error specs)
- Hooks: All existing `data-testid` attributes, test events (`TestEventKind.*`), and selector helpers remain functional at the same runtime values
- Gaps: None. This is a behavior-preserving refactoring -- the existing Playwright suite serves as the regression gate. No new behavior is introduced that would require new tests.
- Evidence: Task #16 reports `pnpm check` passed. The plan verification confirms the suite was run.

---

## 7) Adversarial Sweep (must attempt >=3 credible failures or justify none)

**Attack 1: CSS @import ordering breaks theme application**

- Checks attempted: Verified that `@import "./app-theme.css"` at `src/index.css:123-124` appears after the first `@layer base` block (which defines `:root` variables) and before the second `@layer base` block (which sets `border-color`, `body` styles). The `app-theme.css` file wraps its custom properties in `@layer base` and utilities outside any layer (matching the original placement).
- Evidence: `src/index.css:36-121` defines the first `@layer base` with `:root` tokens. `src/index.css:123-124` places the import. `src/index.css:126-139` defines the second `@layer base`. `src/app-theme.css:7-27` wraps `--electronics-*` properties in `@layer base`, and lines 29-72 define `@utility` directives outside layers.
- Why code held up: In Tailwind CSS v4, `@import` statements are processed by the build tool (Vite/PostCSS) before layer resolution. The `@layer base` in `app-theme.css` merges into the same `base` layer as the main file. The `@utility` directives in `app-theme.css` are processed identically to their original position in `index.css`. The `glare-sweep` keyframes moved from `@layer components` in `index.css` to `@layer components` in `app-theme.css` -- same layer, so specificity is preserved.

**Attack 2: Provider reordering breaks QuerySetup toast wiring**

- Checks attempted: In the original code, `QuerySetup` was rendered inside `DeploymentProvider` (position 7 in the nesting chain). After the refactoring, it renders inside `CoreProviders` (position 3, after `ToastProvider`). The question is whether `QuerySetup` depends on any context from `AuthProvider`, `AuthGate`, `SseContextProvider`, or `DeploymentProvider`.
- Evidence: `src/providers/core-providers.tsx:15-29` shows `QuerySetup` calls `useToast()` and `setToastFunction()`. `src/lib/query-client.ts:8-9` shows `setToastFunction` is a simple module-level setter. Neither function requires auth, SSE, or deployment context.
- Why code held up: `QuerySetup`'s only context dependency is `useToast()`, which is provided by `ToastProvider` (its direct ancestor in `CoreProviders`). The `showError` and `showException` functions are stable references from the toast context. Moving `QuerySetup` higher in the tree is safe and arguably more correct, since it means the toast-query wiring is established before auth or SSE providers render.

**Attack 3: Fixture extension chain type mismatch causes runtime fixture resolution failure**

- Checks attempted: `tests/support/fixtures-infrastructure.ts:70` exports `infrastructureFixtures = base.extend<InfrastructureFixtures, InternalFixtures>(...)`. `tests/support/fixtures.ts:62` calls `infrastructureFixtures.extend<AppFixtures>(...)`. If any fixture in `AppFixtures` references a fixture defined in `InfrastructureFixtures` (like `backendUrl`, `page`, `deploymentSse`), the Playwright fixture resolver must be able to find them in the parent chain.
- Evidence: `tests/support/fixtures.ts:63` uses `{ backendUrl }`, line 68 uses `{ apiClient, backendUrl }`, line 121 uses `{ page, backendUrl, deploymentSse }`. All of these are defined in `InfrastructureFixtures` (lines 52-63 of `fixtures-infrastructure.ts`).
- Why code held up: Playwright's `test.extend()` is designed for chaining -- `.extend<AppFixtures>()` inherits all fixtures from the parent. The fixture resolution is based on the full chain, so `backendUrl` from the infrastructure layer is available to domain fixtures. The `InfrastructureFixtures` type is exported, making it visible to the domain layer for type-checking. The `_serviceManager` worker-scoped fixture remains in the infrastructure layer where it belongs.

---

## 8) Invariants Checklist (table)

- Invariant: Provider nesting order must be QueryClientProvider > ToastProvider > AuthProvider > AuthGate > SseContextProvider > DeploymentProvider
  - Where enforced: `src/providers/core-providers.tsx:32-38` (Core), `src/providers/auth-providers.tsx:11-16` (Auth), `src/providers/sse-providers.tsx:11-16` (SSE), `src/routes/__root.tsx:26-32` (composition)
  - Failure mode: Rendering a context consumer before its provider would cause a "context not found" React error (or a silent `undefined` default)
  - Protection: TypeScript compilation would fail if a hook like `useToast()` were called outside its provider. The three provider files are simple wrappers with no conditional rendering. The composition in `__root.tsx` is a fixed JSX tree.
  - Evidence: `src/providers/core-providers.tsx:15-16` -- `QuerySetup` calls `useToast()`, which requires `ToastProvider` as ancestor (satisfied by line 34)

- Invariant: All test event types must be defined in exactly one location and importable by both src/ and tests/ code
  - Where enforced: `src/lib/test/test-events.ts:1-162` (sole definition), path alias `@/lib/test/test-events` resolves in both `tsconfig.json` and `tsconfig.playwright.json`
  - Failure mode: If the file were duplicated or if path resolution differed between app and test configs, type mismatches would cause compile errors
  - Protection: `src/types/test-events.ts` is deleted, preventing stale-file confusion. `pnpm check` validates all imports resolve.
  - Evidence: Grep for `@/types/test-events` returns only documentation files, not code files

- Invariant: Infrastructure test fixtures must be extensible by domain fixtures without modifying infrastructure code
  - Where enforced: `tests/support/fixtures-infrastructure.ts:70` exports `infrastructureFixtures`, `tests/support/fixtures.ts:62` calls `.extend<AppFixtures>()`
  - Failure mode: If infrastructure fixtures were not exported or used a non-standard extension pattern, domain fixtures could not chain onto them
  - Protection: The `InfrastructureFixtures` type is explicitly exported (line 51), and the Playwright `base.extend()` API guarantees the chaining contract
  - Evidence: `tests/support/fixtures.ts:37` imports `{ infrastructureFixtures }`

- Invariant: Selector consumers must be able to access domain selectors without changing their imports
  - Where enforced: `tests/support/selectors.ts:28-33` re-exports domain selectors as `selectors.parts`, `selectors.types`, etc.
  - Failure mode: If re-exports were missing, consumer code like `selectors.parts.page` would be `undefined` at runtime
  - Protection: The `selectors` object is still the single import target. Only two files import from `selectors.ts`, making the surface area small.
  - Evidence: `tests/smoke.spec.ts:2` and `tests/support/page-objects/part-selector-harness.ts:4` both import `{ selectors } from '../selectors'`

---

## 9) Questions / Needs-Info

No blocking questions. The implementation matches the plan closely enough that no clarification is needed before shipping.

---

## 10) Risks & Mitigations (top 3)

- Risk: The circular value import between `selectors.ts` and `selectors-domain.ts` could cause subtle initialization issues if either file is refactored to include top-level logic that depends on the other's exports
- Mitigation: Extract `testId()` into a standalone `tests/support/test-id.ts` module, breaking the cycle. This is a low-effort follow-up that can be done before or shortly after merge.
- Evidence: `tests/support/selectors-domain.ts:8`, `tests/support/selectors.ts:9-14`

- Risk: CSS `@import` placement between two `@layer base` blocks may behave unexpectedly in edge-case Tailwind CSS v4 configurations or future Tailwind updates
- Mitigation: Verify visually after merge that category colors and ai-glare render correctly in both light and dark modes. The existing Playwright suite exercises styled components and would catch gross rendering failures.
- Evidence: `src/index.css:123-124`

- Risk: Future contributors may not understand the infrastructure/domain fixture split and add new page objects to `fixtures-infrastructure.ts` instead of `fixtures.ts`
- Mitigation: The guidepost comment at `tests/support/fixtures.ts:1-10` explains the pattern and gives step-by-step instructions for adding new page objects. The `"Template-owned"` / `"App-owned"` header annotations provide additional guidance.
- Evidence: `tests/support/fixtures.ts:6-9`

---

## 11) Confidence

Confidence: High -- All eight refactorings are mechanical extractions with no logic changes. The code matches the plan precisely. The single finding (circular selector import) is a minor code-quality concern, not a correctness risk. The provider reordering was explicitly analyzed in the plan and is safe given `QuerySetup`'s limited context dependency. Import updates are comprehensive (no stale references found in code files).
