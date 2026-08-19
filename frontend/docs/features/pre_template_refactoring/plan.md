# Pre-Template Refactoring Plan

## 0) Research Log & Findings

**Searched areas and key discoveries:**

- **`src/components/layout/top-bar.tsx`** (lines 57, 65): Hardcodes `"Electronics Inventory Logo"` and `"Electronics"`. These are the only two project-name strings in the top bar.
- **`src/components/layout/sidebar.tsx`** (lines 10-15, 23-31): `SidebarItem` interface is not exported. Navigation items array is defined inline with 7 EI-specific entries. The component itself (collapse behavior, active state, responsive layout) is generic infrastructure.
- **`src/index.css`** (269 lines): Mixed template and app content. Lines 69-74 define `--electronics-*` category colors; lines 122-127 define their dark-mode counterparts; lines 169-210 define `category-*` and `ai-glare` utilities; lines 259-267 define `glare-sweep` keyframes. Everything else is generic design-token infrastructure.
- **`src/routes/__root.tsx`** (lines 49-67): Provider chain nests `QueryClientProvider > ToastProvider > AuthProvider > AuthGate > SseContextProvider > DeploymentProvider > QuerySetup > AppShellFrame`. The `QuerySetup` function (lines 33-47) wires the toast function to the query client.
- **`tests/support/fixtures.ts`** (660 lines): Mixes infrastructure fixtures (`_serviceManager`, `page` enhancement, `testEvents`, `toastHelper`, `fileUploadHelper`, `deploymentSse`, `auth`, log collectors) with domain page-object fixtures (`types`, `appShell`, `parts`, `boxes`, `sellers`, `kits`, `pickLists`, `partsAI`, `partsLocations`, `partsDocuments`, `about`, `shoppingLists`, `apiClient`, `testData`, `aiAnalysisMock`, `aiCleanupMock`).
- **`tests/support/selectors.ts`** (213 lines): `testId()` (line 37), `buildSelector()` (line 208), and `selectors.common` (lines 191-202) are generic infrastructure. `selectors.parts`, `selectors.types`, `selectors.boxes`, and `selectors.sellers` (lines 44-188) are domain-specific. Only two files import from `selectors.ts`: `tests/smoke.spec.ts` and `tests/support/page-objects/part-selector-harness.ts`.
- **`src/types/test-events.ts`** (163 lines): Defines `TestEventKind`, all event interfaces, and `TestEvent` union. Imported by 39 `.ts/.tsx` files across `src/lib/test/`, `src/contexts/`, `src/hooks/`, `src/components/`, `src/routes/`, `src/types/`, and `tests/`. Three test files use relative paths (`../../../src/types/test-events`) instead of the `@/types/test-events` alias.
- **`src/lib/test/`**: Contains 9 instrumentation files but no `test-events.ts` yet. Moving the file here aligns it with the rest of the test instrumentation.
- **`src/providers/`**: Directory does not exist yet; needs to be created.
- **`src/lib/consts.ts`**: Does not exist yet; needs to be created.
- **Context barrel files**: `src/contexts/toast-context.ts` re-exports from `toast-context-base.ts` and `toast-context-provider.tsx`. `src/contexts/deployment-context.ts` follows the same pattern. Provider imports in `__root.tsx` use these barrels.
- **`src/main.tsx`** (line 3): Imports `./index.css`. The app-theme CSS can be imported from within `index.css` itself using a CSS `@import`.

**Conflicts resolved:**

- The refactoring spec suggests importing `app-theme.css` from either `index.css` or `main.tsx`. Since `main.tsx` is the single CSS entry point (`import './index.css'`), importing `app-theme.css` from within `index.css` keeps the CSS import chain self-contained and avoids touching `main.tsx`.
- For fixtures splitting, the spec proposes `infrastructureFixtures` as the export name from `fixtures-infrastructure.ts`. Tests import `{ test, expect }` from `fixtures.ts`, so the app-owned `fixtures.ts` will re-extend infrastructure fixtures and continue exporting `test` and `expect` — no test file imports change.
- For selectors, `selectors.common` contains generic UI patterns (toast, loading, error, search, pagination) that any template-generated app would need, so it stays in `selectors.ts` (infrastructure) alongside `testId()` and `buildSelector()`. The `SelectorPattern` type is not imported by any other file and can be deleted to reduce dead code. Only `selectors.parts`, `selectors.types`, `selectors.boxes`, and `selectors.sellers` move to `selectors-domain.ts`.

---

## 1) Intent & Scope

**User intent**

Refactor the Electronics Inventory frontend to cleanly separate infrastructure code from domain-specific code, creating well-defined seams that will later allow extraction into a Copier-based frontend template. This is a purely structural refactoring with no functional changes. The eight refactorings cover constants extraction, sidebar navigation separation, CSS theme splitting, provider group extraction, test fixture splitting, test selector separation, and test-event type relocation.

**Prompt quotes**

- "Refactor the Electronics Inventory frontend to cleanly separate infrastructure code from domain code, preparing for extraction into a Copier-based frontend template."
- "Since this is a refactoring with clear specifications, resolve all questions autonomously."
- "The detailed specifications for each refactoring are in docs/ei_frontend_refactoring.md -- use those as the authoritative source."

**In scope**

- Create `src/lib/consts.ts` with centralized project constants
- Update `top-bar.tsx` to read project name/title from consts
- Export `SidebarItem` interface from `sidebar.tsx` and extract navigation items to `sidebar-nav.ts`
- Split `index.css` into base theme and `app-theme.css`
- Extract provider groups from `__root.tsx` into `src/providers/`
- Split Playwright `fixtures.ts` into infrastructure and domain layers
- Separate domain selectors from generic selector helpers
- Move `test-events.ts` from `src/types/` to `src/lib/test/` and update all imports
- Verify `pnpm check` passes and all Playwright tests remain green

**Out of scope**

- Functional changes to any component behavior or styling
- Changes to `index.html` (handled at template creation time, not in EI)
- Changes to `vite.config.ts` proxy ports (template-time concern)
- Moving infrastructure Playwright tests to a mother project (separate effort, refactoring #18)
- SSE worker generalization (already generic per refactoring spec #9)
- `package.json` changes (template-time concern)
- Utility file classification (refactoring #17, not in this brief)

**Assumptions / constraints**

- All refactorings are behavior-preserving; no visual or functional differences should be observable.
- The `@/` path alias resolves to `src/` and is available in both the Vite build and the Playwright TypeScript config.
- CSS `@import` within `index.css` is processed by Tailwind CSS v4 / Vite and will be bundled correctly.
- Playwright fixtures use the `base.extend()` chaining pattern, so splitting into `infrastructureFixtures.extend()` preserves the fixture dependency graph.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Create `src/lib/consts.ts` with PROJECT_NAME, PROJECT_TITLE, PROJECT_DESCRIPTION, DEFAULT_BACKEND_PORT, DEFAULT_SSE_GATEWAY_PORT, DEFAULT_FRONTEND_PORT
- [ ] Update `top-bar.tsx` to import PROJECT_TITLE and PROJECT_DESCRIPTION from consts instead of hardcoding "Electronics" and "Electronics Inventory Logo"
- [ ] Export the `SidebarItem` interface from `sidebar.tsx`
- [ ] Create `src/components/layout/sidebar-nav.ts` with the navigation items array extracted from `sidebar.tsx`
- [ ] Update `sidebar.tsx` to import navigation items from `sidebar-nav.ts` instead of defining them inline
- [ ] Split `src/index.css` into a generic base theme (template-owned) and `src/app-theme.css` (app-owned) containing EI-specific colors, category utilities, and ai-glare animation
- [ ] Import `app-theme.css` from `index.css` so the app theme overrides take effect
- [ ] Create `src/providers/core-providers.tsx` wrapping QueryClientProvider + ToastProvider + QuerySetup
- [ ] Create `src/providers/auth-providers.tsx` wrapping AuthProvider + AuthGate
- [ ] Create `src/providers/sse-providers.tsx` wrapping SseContextProvider + DeploymentProvider
- [ ] Simplify `__root.tsx` to compose the three provider groups instead of nesting everything inline
- [ ] Split `tests/support/fixtures.ts` into `fixtures-infrastructure.ts` (generic test infra) and `fixtures.ts` (domain page objects extending infrastructure)
- [ ] Move domain-specific selectors (`selectors.parts`, `selectors.types`, `selectors.boxes`, `selectors.sellers`) from `tests/support/selectors.ts` to a new `tests/support/selectors-domain.ts`, keeping generic helpers (`testId`, `buildSelector`, `selectors.common`) in `selectors.ts` and deleting the unused `SelectorPattern` type
- [ ] Move `src/types/test-events.ts` to `src/lib/test/test-events.ts` and update all imports throughout the codebase
- [ ] All existing Playwright tests continue to pass after refactoring
- [ ] `pnpm check` (TypeScript + lint) passes after all changes

---

## 2) Affected Areas & File Map

### New files

- Area: `src/lib/consts.ts`
- Why: Centralizes project-specific strings and port numbers so they can be imported instead of hardcoded across the codebase.
- Evidence: Hardcoded values in `src/components/layout/top-bar.tsx:57,65`.

- Area: `src/components/layout/sidebar-nav.ts`
- Why: Extracts the domain-specific navigation items array from the generic sidebar shell component.
- Evidence: `src/components/layout/sidebar.tsx:23-31` defines the inline `navigationItems` array.

- Area: `src/app-theme.css`
- Why: Holds EI-specific CSS custom properties (`--electronics-*`), category utilities, and ai-glare animation that are currently mixed into the generic design token system.
- Evidence: `src/index.css:69-74` (category colors), `src/index.css:122-127` (dark-mode category colors), `src/index.css:169-210` (category and ai-glare utilities), `src/index.css:259-267` (glare-sweep keyframes).

- Area: `src/providers/core-providers.tsx`
- Why: Wraps `QueryClientProvider`, `ToastProvider`, and `QuerySetup` into a single composable provider group.
- Evidence: `src/routes/__root.tsx:51-53,57` (the three providers nested inline).

- Area: `src/providers/auth-providers.tsx`
- Why: Wraps `AuthProvider` and `AuthGate` into a composable provider group.
- Evidence: `src/routes/__root.tsx:53-54` (auth providers nested inline).

- Area: `src/providers/sse-providers.tsx`
- Why: Wraps `SseContextProvider` and `DeploymentProvider` into a composable provider group.
- Evidence: `src/routes/__root.tsx:55-56` (SSE providers nested inline).

- Area: `tests/support/fixtures-infrastructure.ts`
- Why: Houses the generic test infrastructure fixtures (service management, page enhancement, test event bridge, log collectors, toast helper, file upload helper, deployment SSE, auth factory) separate from domain page objects.
- Evidence: `tests/support/fixtures.ts:104-658` (all infrastructure fixtures interleaved with domain fixtures).

- Area: `tests/support/selectors-domain.ts`
- Why: Houses EI-specific selector patterns (`selectors.parts`, `selectors.types`, `selectors.boxes`, `selectors.sellers`) separate from the generic helpers (`testId()`, `buildSelector()`, `selectors.common`).
- Evidence: `tests/support/selectors.ts:44-188` (domain selectors).

- Area: `src/lib/test/test-events.ts`
- Why: Relocated from `src/types/test-events.ts` to live alongside the rest of the test instrumentation framework in `src/lib/test/`.
- Evidence: `src/types/test-events.ts` (entire file, 163 lines). Referenced by 39 `.ts/.tsx` files.

### Modified files

- Area: `src/components/layout/top-bar.tsx`
- Why: Replace hardcoded `"Electronics"` and `"Electronics Inventory Logo"` strings with imports from `consts.ts`.
- Evidence: `src/components/layout/top-bar.tsx:57` (`alt="Electronics Inventory Logo"`), `src/components/layout/top-bar.tsx:65` (`Electronics`).

- Area: `src/components/layout/sidebar.tsx`
- Why: Export the `SidebarItem` interface and import `navigationItems` from `sidebar-nav.ts` instead of defining them inline.
- Evidence: `src/components/layout/sidebar.tsx:10-15` (unexported interface), `src/components/layout/sidebar.tsx:23-31` (inline array).

- Area: `src/index.css`
- Why: Remove EI-specific CSS (category colors, category utilities, ai-glare, glare-sweep keyframes) and add `@import "./app-theme.css"` to load the app theme.
- Evidence: Lines 69-74, 122-127, 169-210, 259-267 (all EI-specific content).

- Area: `src/routes/__root.tsx`
- Why: Replace the deeply nested inline provider chain with three composed provider-group components. Move the `QuerySetup` component to `core-providers.tsx`.
- Evidence: `src/routes/__root.tsx:33-67` (QuerySetup function and RootLayout function).

- Area: `tests/support/fixtures.ts`
- Why: Reduce to app-owned domain fixtures that extend `infrastructureFixtures` from `fixtures-infrastructure.ts`. All test file imports (`from '../../support/fixtures'`) remain unchanged.
- Evidence: `tests/support/fixtures.ts:276-320` (domain page object fixtures), `tests/support/fixtures.ts:359-389` (AI mock fixtures).

- Area: `tests/support/selectors.ts`
- Why: Remove domain-specific selector patterns (`selectors.parts`, `selectors.types`, `selectors.boxes`, `selectors.sellers`), keeping `testId()`, `buildSelector()`, and `selectors.common` as generic infrastructure. Delete the unused `SelectorPattern` type. Re-export domain selectors from `selectors-domain.ts` or update the two consumer imports.
- Evidence: `tests/support/selectors.ts:44-188` (domain selectors to remove), `tests/support/selectors.ts:191-202` (`selectors.common` stays).

- Area: 39 files importing `@/types/test-events` or relative paths to `src/types/test-events.ts`
- Why: Update import paths to `@/lib/test/test-events` (or updated relative paths for non-alias imports).
- Evidence: Full list in the research log above. Key categories:
  - `src/lib/test/*.ts` (7 files) -- alias imports
  - `src/contexts/*.tsx` (2 files: `auth-context.tsx`, `sse-context-provider.tsx`) -- alias imports
  - `src/hooks/use-sse-task.ts` -- alias import
  - `src/components/**/*.tsx` (4 files) -- alias imports
  - `src/routes/shopping-lists/$listId.tsx` -- alias import
  - `src/types/playwright-binding.d.ts` -- alias import
  - `tests/support/**/*.ts` (3 files) -- alias imports
  - `tests/e2e/**/*.spec.ts` (14 files) -- alias imports
  - `tests/unit/playwright-bridge.test.ts` -- alias import
  - `tests/smoke.spec.ts` -- relative import (`../src/types/test-events`)
  - `tests/e2e/setup/reset.spec.ts` -- relative import (`../../../src/types/test-events`)
  - `tests/e2e/parallel/worker-isolation.spec.ts` -- relative import (`../../../src/types/test-events`)

### Deleted files

- Area: `src/types/test-events.ts`
- Why: Moved to `src/lib/test/test-events.ts`. Original location is deleted after all imports are updated.
- Evidence: File will be relocated, not duplicated.

---

## 3) Data Model / Contracts

This refactoring introduces no new data models, API contracts, or query cache key changes. All changes are structural (file moves, import path updates, provider composition). The `SidebarItem` interface type is unchanged -- only its export visibility changes.

- Entity / contract: `SidebarItem` interface
- Shape: `{ to: string; label: string; icon: LucideIcon; testId: string }` (unchanged)
- Mapping: None; this is a purely frontend type
- Evidence: `src/components/layout/sidebar.tsx:10-15`

- Entity / contract: Project constants (`consts.ts`)
- Shape: `PROJECT_NAME: string`, `PROJECT_TITLE: string`, `PROJECT_DESCRIPTION: string`, `DEFAULT_BACKEND_PORT: number`, `DEFAULT_SSE_GATEWAY_PORT: number`, `DEFAULT_FRONTEND_PORT: number`
- Mapping: String/number literals consumed directly by components; no API mapping
- Evidence: New file; values sourced from current hardcoded strings in `top-bar.tsx:57,65`

---

## 4) API / Integration Surface

No API or integration surface changes. This refactoring does not alter any HTTP calls, TanStack Query hooks, cache keys, mutation logic, or error handling. All API interactions remain identical.

---

## 5) Algorithms & UI Flows

### Provider composition flow

- Flow: Application initialization and provider nesting
- Steps:
  1. `__root.tsx` `RootLayout` renders `<CoreProviders>` as the outermost wrapper.
  2. `CoreProviders` renders `QueryClientProvider > ToastProvider > QuerySetup > children`. `QuerySetup` calls `setToastFunction` in a `useEffect` to wire the query client's error handler to the toast system.
  3. Inside `CoreProviders`, `<AuthProviders>` renders `AuthProvider > AuthGate > children`. `AuthGate` blocks child rendering until auth state resolves.
  4. Inside `AuthProviders`, `<SseProviders>` renders `SseContextProvider > DeploymentProvider > children`.
  5. Inside `SseProviders`, `<AppShellFrame />` renders the app shell.
- States / transitions: No change to the state machine. The high-level provider group ordering is preserved (Query > Toast > Auth > SSE). `QuerySetup` moves from inside `DeploymentProvider` to inside `CoreProviders` (after `ToastProvider`), which is safe because its only context dependency is `useToast()`. This reordering is intentional and matches the refactoring spec (#6).
- Hotspots: The `QuerySetup` component uses `useToast()` which requires `ToastProvider` to be an ancestor. This dependency is preserved by keeping `QuerySetup` inside `CoreProviders` after `ToastProvider`.
- Evidence: `src/routes/__root.tsx:49-67`

### Sidebar navigation item loading

- Flow: Sidebar renders navigation links from an imported array
- Steps:
  1. `sidebar.tsx` imports `navigationItems` from `./sidebar-nav`.
  2. Component maps over `navigationItems` identically to the current inline array.
  3. No behavioral change; the array reference is simply moved to an external module.
- States / transitions: None changed.
- Hotspots: None. The array is a static constant.
- Evidence: `src/components/layout/sidebar.tsx:63`

---

## 6) Derived State & Invariants

- Derived value: Provider nesting order
  - Source: The three provider group components (`CoreProviders`, `AuthProviders`, `SseProviders`) composed in `__root.tsx`
  - Writes / cleanup: Each provider group manages its own context values; no cross-group writes change
  - Guards: TypeScript compilation will fail if a provider tries to consume a context not yet provided (e.g., `useToast` outside `ToastProvider`)
  - Invariant: `QueryClientProvider` must wrap `ToastProvider` must wrap `AuthProvider` must wrap `SseContextProvider`. This ordering is preserved by the composition in `RootLayout`.
  - Evidence: `src/routes/__root.tsx:49-67`

- Derived value: Navigation items array identity
  - Source: `navigationItems` constant in `sidebar-nav.ts`
  - Writes / cleanup: Read-only array consumed by `sidebar.tsx` render
  - Guards: TypeScript enforces the `SidebarItem[]` type on the exported array
  - Invariant: The array must contain objects with `to`, `label`, `icon`, and `testId` fields. The `SidebarItem` type export ensures this.
  - Evidence: `src/components/layout/sidebar.tsx:23-31`

- Derived value: CSS custom property cascade
  - Source: `index.css` defines base design tokens; `app-theme.css` overrides with EI-specific values
  - Writes / cleanup: Browser applies CSS in import order; `app-theme.css` values override base values for same-named properties
  - Guards: CSS specificity rules ensure `:root` declarations in `app-theme.css` override those in `index.css` when they appear after the base declarations
  - Invariant: `@import "./app-theme.css"` must appear after the base `:root` declarations in `index.css` so EI-specific overrides take precedence.
  - Evidence: `src/index.css:1` (`@import "tailwindcss"` is currently the first line; the app-theme import goes after the base layer)

---

## 7) State Consistency & Async Coordination

- Source of truth: No change. TanStack Query cache remains the source of truth for server state. React contexts remain sources of truth for auth, toast, SSE, and deployment state.
- Coordination: Provider group extraction does not alter context value production or consumption. Each provider group is a pass-through wrapper that composes the same providers in the same order.
- Async safeguards: `QuerySetup`'s `useEffect` for wiring `setToastFunction` moves into `CoreProviders` but retains the same dependencies (`showError`, `showException`). The effect timing is unchanged because `CoreProviders` renders in the same position relative to `ToastProvider`.
- Instrumentation: No instrumentation changes. Test events, form tracking, and list loading instrumentation are unaffected. The `test-events.ts` type relocation changes import paths only, not runtime behavior.
- Evidence: `src/routes/__root.tsx:33-47` (QuerySetup effect)

---

## 8) Errors & Edge Cases

- Failure: CSS `@import` order causes EI theme overrides to not apply
- Surface: All components using `--primary`, `--electronics-*` custom properties
- Handling: Visual inspection; colors revert to base theme defaults if import order is wrong
- Guardrails: Place `@import "./app-theme.css"` after `@import "tailwindcss"` and after the base `:root` block in `index.css`. Tailwind CSS v4 processes `@import` statements correctly in this position.
- Evidence: `src/index.css:1` (current `@import "tailwindcss"`)

- Failure: Fixture extension chain breaks (TypeScript error in `fixtures.ts`)
- Surface: All Playwright test files importing `{ test, expect }` from fixtures
- Handling: TypeScript compilation will catch type mismatches when extending `infrastructureFixtures`
- Guardrails: `pnpm check` must pass after the split. The infrastructure fixtures export a typed `base.extend<InfrastructureFixtures, InternalFixtures>()` result; the domain fixtures call `.extend<AppFixtures>()` on that result.
- Evidence: `tests/support/fixtures.ts:104`

- Failure: Import path missed during `test-events.ts` relocation
- Surface: TypeScript compilation errors in any of the 39 importing files
- Handling: `pnpm check` will fail with unresolved module errors
- Guardrails: Use codebase-wide find-and-replace for both `@/types/test-events` and relative `types/test-events` patterns rather than relying solely on the enumerated file list. The three relative-path imports (`tests/smoke.spec.ts`, `tests/e2e/setup/reset.spec.ts`, `tests/e2e/parallel/worker-isolation.spec.ts`) need special attention since they use `../src/types/test-events` rather than the `@/` alias.
- Evidence: Grep results from research log

- Failure: `SidebarItem` type not importable after refactoring
- Surface: `src/components/layout/sidebar-nav.ts` importing `type { SidebarItem } from './sidebar'`
- Handling: TypeScript compilation error if the export is missing
- Guardrails: Change `interface SidebarItem` to `export interface SidebarItem` in `sidebar.tsx`
- Evidence: `src/components/layout/sidebar.tsx:10`

---

## 9) Observability / Instrumentation

No new instrumentation signals are added. Existing signals are preserved:

- Signal: All `TestEventKind` events (ROUTE, FORM, API, TOAST, ERROR, QUERY_ERROR, UI_STATE, SSE, LIST_LOADING)
- Type: Instrumentation events emitted via `emitTestEvent`
- Trigger: Same triggers as before; the `test-events.ts` relocation changes only the import path, not the runtime module
- Labels / fields: Unchanged
- Consumer: Playwright `waitTestEvent` helper, `TestEventCapture` fixture
- Evidence: `src/lib/test/event-emitter.ts:7-8` (imports from `@/types/test-events`, to be updated to `@/lib/test/test-events`)

---

## 10) Lifecycle & Background Work

No lifecycle or background work changes. The provider group extraction moves existing `useEffect` hooks into wrapper components but does not alter their mount/unmount timing, dependency arrays, or cleanup functions.

- Hook / effect: `QuerySetup` `useEffect` (wires `setToastFunction`)
- Trigger cadence: On mount, and when `showError`/`showException` change (stable references)
- Responsibilities: Connects the query client's global error handler to the toast system
- Cleanup: None needed (the function reference is overwritten, not subscribed)
- Evidence: `src/routes/__root.tsx:36-44` (moves to `src/providers/core-providers.tsx`)

---

## 11) Security & Permissions

No security or permission changes. Authentication flow, AuthGate behavior, and OIDC integration are structurally relocated into `AuthProviders` but remain functionally identical. No new data exposure or access control changes are introduced.

---

## 12) UX / UI Impact

No UX or UI impact. This refactoring is purely structural. The rendered output, styling, navigation, and user interactions remain identical. The CSS split preserves all custom properties and utility classes. The top bar displays the same text (sourced from constants instead of literals). The sidebar renders the same navigation items (sourced from an imported array instead of an inline array).

---

## 13) Deterministic Test Plan

### Existing test suite as regression gate

- Surface: All existing Playwright specs
- Scenarios:
  - Given the refactoring is complete, When `pnpm playwright test` runs the full suite, Then all tests pass without modification to test logic (only import paths change in test files that import `test-events` types)
  - Given the refactoring is complete, When `pnpm check` runs, Then TypeScript strict mode and ESLint pass with no errors
- Instrumentation / hooks: All existing `data-testid` attributes, test events, and selector helpers remain functional
- Gaps: No new tests are needed because this is a behavior-preserving refactoring. The existing suite serves as the regression gate.
- Evidence: `tests/e2e/` (full spec suite), `tests/smoke.spec.ts`

### CSS theme split verification

- Surface: Visual rendering of the application
- Scenarios:
  - Given `index.css` imports `app-theme.css`, When the app loads in a browser, Then EI brand colors (teal primary), category border colors, and ai-glare hover effect render identically to before
  - Given `index.css` imports `app-theme.css`, When dark mode is active, Then dark-mode category colors and shadow overrides render correctly
- Instrumentation / hooks: Existing Playwright tests that interact with styled components serve as visual regression. The `smoke.spec.ts` test validates basic page load.
- Gaps: No pixel-perfect visual regression testing is added. This is acceptable because the CSS refactoring is a mechanical split with no value changes.
- Evidence: `tests/smoke.spec.ts`

### Provider composition verification

- Surface: Application initialization and auth flow
- Scenarios:
  - Given providers are composed via three wrapper components, When the app loads, Then QueryClientProvider, ToastProvider, AuthProvider, AuthGate, SseContextProvider, and DeploymentProvider all function correctly
  - Given `QuerySetup` moves into `CoreProviders`, When a mutation error occurs, Then the toast notification appears (proving the toast-query wiring survived)
- Instrumentation / hooks: Existing auth tests (`tests/e2e/auth/auth.spec.ts`), deployment tests (`tests/e2e/deployment/`), and toast tests (`tests/e2e/app-shell/toast-display.spec.ts`) exercise these provider paths.
- Gaps: None; existing tests provide sufficient coverage.
- Evidence: `tests/e2e/auth/auth.spec.ts`, `tests/e2e/deployment/`

---

## 14) Implementation Slices

Implementation should proceed in dependency order. Each slice should pass `pnpm check` before moving to the next.

- Slice: 1 -- Constants and TopBar
- Goal: Centralize project strings and eliminate hardcoded values from the top bar
- Touches: Create `src/lib/consts.ts`, modify `src/components/layout/top-bar.tsx`
- Dependencies: None; this is the foundation slice

- Slice: 2 -- Sidebar navigation extraction
- Goal: Separate domain navigation items from the generic sidebar shell
- Touches: Modify `src/components/layout/sidebar.tsx` (export `SidebarItem`, remove inline array, add import), create `src/components/layout/sidebar-nav.ts`
- Dependencies: None; independent of slice 1

- Slice: 3 -- CSS theme split
- Goal: Separate EI brand colors and custom utilities from the generic design token system
- Touches: Modify `src/index.css`, create `src/app-theme.css`
- Dependencies: None; independent of slices 1-2

- Slice: 4 -- Provider group extraction
- Goal: Decompose the monolithic provider chain into composable groups
- Touches: Create `src/providers/core-providers.tsx`, `src/providers/auth-providers.tsx`, `src/providers/sse-providers.tsx`. Modify `src/routes/__root.tsx` (remove inline providers, import groups)
- Dependencies: None; independent of slices 1-3

- Slice: 5 -- Test-events relocation
- Goal: Move test event types to live with the test instrumentation framework
- Touches: Move `src/types/test-events.ts` to `src/lib/test/test-events.ts`. Update imports in 39 files (see file map). Delete `src/types/test-events.ts`.
- Dependencies: None; independent of slices 1-4. This is a high-touch slice due to the number of import updates, so it benefits from being done in isolation to keep the diff clean.

- Slice: 6 -- Playwright fixtures split
- Goal: Separate infrastructure fixtures from domain page-object fixtures
- Touches: Create `tests/support/fixtures-infrastructure.ts`, modify `tests/support/fixtures.ts`
- Dependencies: None; independent of slice 5 (test-events relocation may change an import in the fixtures file, so doing slice 5 first avoids a conflict, but both can be done in either order)

- Slice: 7 -- Test selectors split
- Goal: Separate domain selectors from generic helpers
- Touches: Create `tests/support/selectors-domain.ts`, modify `tests/support/selectors.ts`, update imports in `tests/smoke.spec.ts` and `tests/support/page-objects/part-selector-harness.ts`
- Dependencies: None; independent of slice 6

- Slice: 8 -- Final verification
- Goal: Confirm all changes work together
- Touches: No code changes; run `pnpm check` and `pnpm playwright test`
- Dependencies: All previous slices complete

---

## 15) Risks & Open Questions

- Risk: CSS `@import` ordering within `index.css` causes Tailwind CSS v4 to process `app-theme.css` before the base `:root` block, making app overrides ineffective
- Impact: EI brand colors and category utilities would not render; the app would show generic base-theme colors
- Mitigation: Place `@import "./app-theme.css"` after the `@import "tailwindcss"` line and after the base `@layer base` block containing `:root`. Verify visually after the change and confirm existing Playwright tests pass.

- Risk: Fixture extension typing becomes too complex after splitting, causing obscure TypeScript errors
- Impact: Developers unable to add new page-object fixtures without understanding the two-layer extension pattern
- Mitigation: Add a guidepost comment at the top of `fixtures.ts` explaining the infrastructure/domain split pattern and how to add new fixtures. Keep the `InfrastructureFixtures` type exported alongside the fixtures for clarity.

- Risk: Relative-path imports of `test-events.ts` in three test files are missed or updated incorrectly
- Impact: TypeScript compilation failure in those specific test files
- Mitigation: The three files (`tests/smoke.spec.ts`, `tests/e2e/setup/reset.spec.ts`, `tests/e2e/parallel/worker-isolation.spec.ts`) use relative paths to `../src/types/test-events`. After relocation, the relative path becomes `../src/lib/test/test-events`. Alternatively, convert them to the `@/lib/test/test-events` alias if the Playwright tsconfig supports it (it does, per `tsconfig.playwright.json`). Using the alias is preferred for consistency.

- Risk: Circular dependency between `sidebar-nav.ts` importing from `sidebar.tsx` and `sidebar.tsx` importing from `sidebar-nav.ts`
- Impact: Module resolution error or undefined exports at runtime
- Mitigation: This is a safe pattern because `sidebar-nav.ts` imports only the `SidebarItem` type (a `type` import) from `sidebar.tsx`, while `sidebar.tsx` imports the `navigationItems` value from `sidebar-nav.ts`. TypeScript `type` imports are erased at runtime, so no circular runtime dependency exists. Use `import type { SidebarItem }` to make this explicit.

---

## 16) Confidence

Confidence: High -- All eight refactorings are mechanical file moves, export changes, and import rewrites with no logic changes. The refactoring spec provides exact before/after content for each file. The existing Playwright test suite and TypeScript strict mode serve as comprehensive regression gates.
