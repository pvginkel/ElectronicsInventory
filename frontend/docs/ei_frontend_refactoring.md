# ElectronicsInventory Frontend — Pre-Template Refactoring Guide

This document lists refactorings to apply to `/work/ElectronicsInventory-new/frontend` **before** extracting the frontend Copier template. Each change makes the infrastructure code more generic and reduces the number of `.jinja` files needed in the template.

The goal is the same as the backend refactoring: separate infrastructure from domain, centralize project-specific values, and create clean seams between template-owned and app-owned code.

## Table of Contents

1. [Create `src/lib/consts.ts`](#1-create-srclibconststs)
2. [Extract sidebar navigation items](#2-extract-sidebar-navigation-items)
3. [Make TopBar read from consts](#3-make-topbar-read-from-consts)
4. [Make `index.html` generic](#4-make-indexhtml-generic)
5. [Split `index.css` into base + app theme](#5-split-indexcss-into-base--app-theme)
6. [Extract `__root.tsx` provider groups into separate files](#6-extract-__roottsx-provider-groups-into-separate-files)
7. [Make DeploymentProvider SSE-conditional](#7-make-deploymentprovider-sse-conditional)
8. [Extract `vite.config.ts` proxy ports into consts or env](#8-extract-viteconfigts-proxy-ports-into-consts-or-env)
9. [Generalize the SSE worker event types](#9-generalize-the-sse-worker-event-types)
10. [Generalize `use-sse-task.ts` event parsing](#10-generalize-use-sse-taskts-event-parsing)
11. [Move `use-paginated-fetch-all.ts` to `lib/`](#11-move-use-paginated-fetch-allts-to-lib)
12. [Make `package.json` scripts generic](#12-make-packagejson-scripts-generic)
13. [Classify Playwright test support files](#13-classify-playwright-test-support-files)
14. [Move domain page objects out of fixtures](#14-move-domain-page-objects-out-of-fixtures)
15. [Make test `selectors.ts` generic](#15-make-test-selectorsts-generic)
16. [Move `types/test-events.ts` to `lib/test/`](#16-move-typestest-eventsts-to-libtest)
17. [Classify `src/lib/utils/` files](#17-classify-srclibutils-files)
18. [Move template infrastructure tests to the mother project](#18-move-template-infrastructure-tests-to-the-mother-project)

---

## 1. Create `src/lib/consts.ts`

**Why:** Mirrors the backend's `consts.py` pattern. Centralizes all project-specific strings so the template can generate this file once (`_skip_if_exists`) instead of sprinkling Jinja variables across many files.

**Current state:** Project name appears in:
- `index.html` → `<title>Electronics Inventory</title>`
- `top-bar.tsx` → `"Electronics"` (line 65)
- `top-bar.tsx` → `"Electronics Inventory Logo"` (alt text, line 57)
- `sidebar.tsx` → no project name, but navigation items are app-specific

**Action:** Create `src/lib/consts.ts`:

```typescript
/** Project constants. App-owned — never overwritten by template updates. */
export const PROJECT_NAME = "electronics-inventory";
export const PROJECT_TITLE = "Electronics";
export const PROJECT_DESCRIPTION = "Electronics Inventory";
export const DEFAULT_BACKEND_PORT = 5000;
export const DEFAULT_SSE_GATEWAY_PORT = 3001;
export const DEFAULT_FRONTEND_PORT = 3000;
```

Then update `top-bar.tsx` and any other files to import from this module.

**Template impact:** `consts.ts` becomes an app-owned file (`_skip_if_exists`). Template generates it once with project-specific values from copier answers. No `.jinja` needed elsewhere for the project name.

---

## 2. Extract sidebar navigation items

**Why:** The `Sidebar` component is template infrastructure (collapse behavior, responsive layout, active state styling), but the navigation items array is entirely app-specific. Separating them creates a clean seam.

**Current state:** `src/components/layout/sidebar.tsx` lines 23-31 hardcode:
```typescript
const navigationItems: SidebarItem[] = [
  { to: '/parts', label: 'Parts', icon: Wrench, testId: 'parts' },
  { to: '/kits', label: 'Kits', icon: CircuitBoard, testId: 'kits' },
  // ... 5 more EI-specific items
]
```

**Action:**
1. Create `src/components/layout/sidebar-nav.ts` (app-owned):
   ```typescript
   import { Wrench, CircuitBoard, ShoppingCart, Archive, Tag, Store, Info } from 'lucide-react'
   import type { SidebarItem } from './sidebar'

   export const navigationItems: SidebarItem[] = [
     { to: '/parts', label: 'Parts', icon: Wrench, testId: 'parts' },
     { to: '/kits', label: 'Kits', icon: CircuitBoard, testId: 'kits' },
     { to: '/shopping-lists', label: 'Shopping Lists', icon: ShoppingCart, testId: 'shopping-lists' },
     { to: '/boxes', label: 'Storage', icon: Archive, testId: 'boxes' },
     { to: '/types', label: 'Types', icon: Tag, testId: 'types' },
     { to: '/sellers', label: 'Sellers', icon: Store, testId: 'sellers' },
     { to: '/about', label: 'About', icon: Info, testId: 'about' },
   ]
   ```

2. Export the `SidebarItem` interface from `sidebar.tsx`.
3. Import `navigationItems` from `./sidebar-nav` in `sidebar.tsx`.

**Template impact:** `sidebar.tsx` (template-owned) imports from `sidebar-nav.ts` (app-owned, `_skip_if_exists`). Template generates a default `sidebar-nav.ts` with a single "Home" item. No `.jinja` needed.

---

## 3. Make TopBar read from consts

**Why:** The TopBar has two hardcoded EI-specific strings. Reading from consts makes it template-generic.

**Current state:** `src/components/layout/top-bar.tsx`:
- Line 57: `alt="Electronics Inventory Logo"`
- Line 65: `Electronics`

**Action:**
```typescript
import { PROJECT_TITLE, PROJECT_DESCRIPTION } from '@/lib/consts'

// In JSX:
<img src="/favicon.png" alt={`${PROJECT_DESCRIPTION} Logo`} ... />
<span ...>{PROJECT_TITLE}</span>
```

**Template impact:** `top-bar.tsx` becomes fully template-owned with no Jinja. App customization is via `consts.ts`.

---

## 4. Make `index.html` a Jinja template

**Why:** The HTML title is the only app-specific content. A minimal `.jinja` file is the simplest approach.

**Current state:** `<title>Electronics Inventory</title>` hardcoded in `index.html`.

**Action:** No EI refactoring needed. The template will use `index.html.jinja` with `<title>{{ project_description }}</title>`. The favicon path (`/favicon.png`) is app-provided and doesn't need to change.

**Template impact:** `index.html.jinja` is a trivial template. One of the accepted `.jinja` files.

---

## 5. Split `index.css` into base + app theme

**Why:** `index.css` contains both generic template infrastructure (the shadcn/ui-compatible design token system, base layer, scrollbar styles, custom utilities) and app-specific content (electronics category colors, ai-glare animation). Splitting them allows the template to own the base theme while apps customize their color palette.

**Current state:** `src/index.css` (269 lines) has:
- Lines 1-34: `@theme` block with Tailwind v4 color mappings → **template**
- Lines 36-88: `:root` light mode variables → **mixed** (base tokens are template, EI colors are app)
- Lines 69-74: `--electronics-*` category colors → **app-specific**
- Lines 90-134: Dark mode variables → **mixed** (same split)
- Lines 137-150: Base layer (border, body, scrollbar reset) → **template**
- Lines 152-167: Shadow utilities → **template**
- Lines 169-187: `category-*` utilities → **app-specific**
- Lines 189-210: `ai-glare` utility → **app-specific**
- Lines 212-218: `text-link` utility → **template**
- Lines 220-268: Components layer (dark mode overrides, scrollbar, glare animation) → **mixed**

**Action:**
1. Keep `src/index.css` as the template-owned base theme containing:
   - `@import "tailwindcss"`
   - `@theme` block (color mappings, radius)
   - `:root` with generic design tokens (primary, secondary, accent, destructive, muted, success, warning, info, link, spacing, shadows — all with sensible defaults, e.g., a blue-ish primary)
   - Dark mode overrides for the generic tokens
   - Base layer (border, body, scrollbar)
   - Generic utilities (shadow-soft, shadow-medium, shadow-strong, text-link, transition-smooth)
   - Scrollbar styles, dark mode text overrides

2. Create `src/app-theme.css` (app-owned) containing:
   - `--primary` and related overrides (EI's teal `165 68% 46%` palette)
   - `--electronics-*` category colors
   - `category-*` utilities
   - `ai-glare` utility and animation

3. In `index.css` (or `main.tsx`), import the app theme:
   ```css
   @import "tailwindcss";
   @import "./app-theme.css";
   ```

**Template impact:** `index.css` is template-owned with generic defaults. `app-theme.css` is app-owned (`_skip_if_exists`). Apps override the CSS custom properties for their brand colors. No `.jinja` needed.

---

## 6. Extract `__root.tsx` provider groups into separate files

**Why:** The root route has a deeply nested provider chain. Some providers are always-on (Query, Toast), some are feature-flag-conditional (Auth/AuthGate for `use_oidc`, SSE for `use_sse`). Rather than using Jinja conditionals inside `__root.tsx`, we can split the providers into composable groups that are conditionally imported.

**Current state:** `src/routes/__root.tsx` nests:
```
QueryClientProvider → ToastProvider → AuthProvider → AuthGate → SseContextProvider → DeploymentProvider → QuerySetup → AppShellFrame
```

All providers are always present — there's no conditional nesting.

**Action:**

1. Create `src/providers/core-providers.tsx` (template-owned, always present):
   ```typescript
   export function CoreProviders({ children }) {
     return (
       <QueryClientProvider client={queryClient}>
         <ToastProvider>
           <QuerySetup>{children}</QuerySetup>
         </ToastProvider>
       </QueryClientProvider>
     );
   }
   ```

2. Create `src/providers/auth-providers.tsx` (template-owned, included when `use_oidc`):
   ```typescript
   export function AuthProviders({ children }) {
     return (
       <AuthProvider>
         <AuthGate>{children}</AuthGate>
       </AuthProvider>
     );
   }
   ```

3. Create `src/providers/sse-providers.tsx` (template-owned, included when `use_sse`):
   ```typescript
   export function SseProviders({ children }) {
     return (
       <SseContextProvider>
         <DeploymentProvider>{children}</DeploymentProvider>
       </SseContextProvider>
     );
   }
   ```

4. Simplify `__root.tsx` to compose providers:
   ```typescript
   import { CoreProviders } from '@/providers/core-providers'
   import { AuthProviders } from '@/providers/auth-providers'
   import { SseProviders } from '@/providers/sse-providers'

   function RootLayout() {
     return (
       <CoreProviders>
         <AuthProviders>
           <SseProviders>
             <AppShellFrame />
           </SseProviders>
         </AuthProviders>
       </CoreProviders>
     );
   }
   ```

**Template impact:** `__root.tsx` becomes a minimal `.jinja` file (or even plain `.tsx` with dynamic imports) that selects which provider files to import based on feature flags. The individual provider files are plain `.tsx` — no Jinja. The template includes/excludes entire files rather than templating code inside them.

**Alternative approach:** If we want zero `.jinja` for `__root.tsx`, we can use a `providers/index.ts` barrel that re-exports the active provider chain, and make that barrel a `.jinja` file:
```typescript
// providers/index.ts.jinja
export { CoreProviders } from './core-providers'
{% if use_oidc %}export { AuthProviders } from './auth-providers'{% endif %}
{% if use_sse %}export { SseProviders } from './sse-providers'{% endif %}
```
This concentrates all Jinja in a single small barrel file.

---

## 7. Make DeploymentProvider SSE-conditional

**Why:** `DeploymentProvider` uses `useVersionSSE` which requires the SSE context. It should only exist when `use_sse` is enabled. Currently it's always present.

**Current state:** `DeploymentProvider` is inside the SSE provider nesting in `__root.tsx`, so it works. But it makes no sense without SSE.

**Action:** This is handled naturally by the provider group extraction in refactoring #6 — `DeploymentProvider` goes inside `SseProviders`, which is only included when `use_sse` is true.

Also, `DeploymentNotificationBar` in `AppShellFrame` should be conditional:
```typescript
// In AppShellFrame:
{/* Only render if SSE is enabled — deployment bar uses SSE version tracking */}
<DeploymentNotificationBar />
```

The cleanest approach: `DeploymentNotificationBar` can self-guard (render nothing if no deployment context is available), or it can be conditionally rendered in the template version of `__root.tsx`.

**Template impact:** No extra work — covered by #6.

---

## 8. Extract `vite.config.ts` proxy ports into consts or env

**Why:** The backend proxy port (`5000`) and SSE gateway port (`3001`) are hardcoded as fallback defaults. These should come from consts so each app can have its own default ports.

**Current state:** `vite.config.ts` lines 86-87:
```typescript
const backendProxyTarget = process.env.BACKEND_URL || 'http://localhost:5000'
const gatewayProxyTarget = process.env.SSE_GATEWAY_URL || 'http://localhost:3001'
```

**Action:** Import defaults from a vite-compatible config (can't use `@/lib/consts.ts` directly in vite config since it runs in Node context). Options:

**Option A (preferred):** Read from `consts.ts` isn't possible at vite config time, but we can just make `vite.config.ts` a `.jinja` file with the port values:
```typescript
const backendProxyTarget = process.env.BACKEND_URL || 'http://localhost:{{ backend_port }}'
const gatewayProxyTarget = process.env.SSE_GATEWAY_URL || 'http://localhost:{{ sse_gateway_port }}'
```

This is one of the files where a `.jinja` extension is justified — the port values are compile-time configuration that can't easily be read from a runtime consts file.

**Option B:** Create a separate `vite.ports.ts` (app-owned) that exports port numbers, and import it. But this adds a file for two numbers.

**Recommendation:** Accept `vite.config.ts.jinja` — it's a reasonable use of Jinja for build-time configuration. The template already needs this for conditionally including the SSE proxy block.

**Template impact:** `vite.config.ts.jinja` with port values and SSE proxy conditionals. This is one of the unavoidable `.jinja` files.

---

## 9. Generalize the SSE worker event types

**Why:** The SharedWorker (`src/workers/sse-worker.ts`) currently handles `version` and `task_event` SSE event types. These are the standard event types used by the SSE Gateway across all apps. The worker code is already generic.

**Current state:** The worker handles:
- `version` events → broadcast version data
- `task_event` events → broadcast task event data
- `connection_close` events → clean disconnect

**Action:** Review and confirm the worker is already generic. The event types (`version`, `task_event`, `connection_close`) are SSE Gateway protocol, not app-specific. No changes needed unless app-specific event types are found.

**Template impact:** `sse-worker.ts` is template-owned as-is. Good to go.

---

## 10. Generalize `use-sse-task.ts` event parsing

**Why:** `src/hooks/use-sse-task.ts` defines task event types (`SSEProgressEvent`, `SSEResultEvent`, `SSEErrorEvent`, `SSEStartedEvent`) that are generic SSE Gateway protocol types, not EI-specific. However, the hook's result/progress parsing may contain app-specific assumptions.

**Current state:** The hook handles generic event types:
- `task_started` → set subscribed state
- `progress_update` → track progress
- `task_completed` → parse result
- `task_failed` → parse error

**Action:** Review the event type definitions and confirm they match the SSE Gateway protocol. If they do, the hook is template-generic. Move the event type interfaces into a shared types file (e.g., `src/types/sse-events.ts` or `src/lib/api/sse-types.ts`).

If there's any EI-specific result parsing (e.g., AI analysis result shapes), that should be moved to app-level hooks that wrap `useSSETask`.

**Template impact:** `use-sse-task.ts` is template-owned. App-specific task result types are defined in app-owned files.

---

## 11. Move `use-paginated-fetch-all.ts` to `lib/`

**Why:** This is a fully generic utility hook (no app-specific logic). It's currently in `src/hooks/` alongside domain hooks, making it hard to distinguish infrastructure from domain.

**Current state:** `src/hooks/use-paginated-fetch-all.ts` — generic pagination hook with `FetchPageCallback<T>` interface.

**Action:** Move to `src/lib/hooks/use-paginated-fetch-all.ts` or keep in `src/hooks/` but document clearly that it's template-owned. The template will need a clean distinction between template hooks and app hooks.

**Recommendation:** Keep in `src/hooks/` — moving creates import churn for no functional benefit. Instead, document which hooks are template-owned in the file ownership model:
- Template-owned: `use-auth.ts`, `use-toast.ts`, `use-sse-task.ts`, `use-version-sse.ts`, `use-paginated-fetch-all.ts`
- App-owned: everything else in `src/hooks/`

**Template impact:** Template includes these specific hook files. App adds its own hooks alongside them.

---

## 12. Make `package.json` scripts generic

**Why:** The `package.json` has scripts referencing app-specific paths and configurations. Some are generic, some need parameterization.

**Current state:** Key scripts include:
- `dev`: `vite --port 3000` — port should come from template variable
- `build`: Includes `generate:api:build`, type-check, vite build, verify
- `generate:api`: `node scripts/generate-api.js --fetch` — generic
- `verify:build`: `node scripts/verify-production-build.cjs` — generic

**Action:** Most scripts are already generic. The main changes:
- Port in `dev` script → `vite --port 3000` is fine as default, apps can override
- The `generate:api` and `fetch-openapi` scripts are already generic

`package.json` will be a `.jinja` file for the template (needed for project name, description, author fields). This is unavoidable and acceptable.

**Template impact:** `package.json.jinja` with copier variables for metadata fields. Scripts section is largely static.

---

## 13. Classify Playwright test support files

**Why:** The test infrastructure is critical for the template. We need to clearly identify which test support files are template-owned (generic test infrastructure) vs app-owned (domain page objects, test data).

**Current state:** `tests/support/` contains:

**Template-owned (generic infrastructure):**
- `global-setup.ts` — seeded SQLite, temp dir management
- `fixtures.ts` — service management, page enhancement, test event bridge
- `helpers.ts` — `makeUniqueToken`, `waitTestEvent`, `waitForUiState`, etc.
- `helpers/test-events.ts` — `TestEventBuffer`, `TestEventCapture`
- `helpers/toast-helpers.ts` — toast assertion utilities
- `helpers/deployment-sse.ts` — SSE connection helpers
- `helpers/file-upload.ts` — file upload simulation
- `process/servers.ts` — backend/frontend/gateway process management
- `process/backend-logs.ts` — log collection and attachment
- `process/deployment-reset.ts` — deployment request ID reset
- `backend-url.ts` — backend URL configuration

**App-owned (domain-specific):**
- `selectors.ts` — domain-specific selectors (parts, boxes, sellers, etc.)
- `helpers/ai-analysis-mock.ts` — EI-specific AI task simulation
- `helpers/ai-cleanup-mock.ts` — EI-specific AI cleanup simulation
- Page objects: `page-objects/parts.ts`, `page-objects/boxes.ts`, etc.
- Test data: `test-data/` files
- API client helpers with domain methods

**Action:**
1. Ensure template-owned files have no domain imports.
2. The `fixtures.ts` file needs refactoring — it currently registers domain page objects directly:
   ```typescript
   // In fixtures — these are app-specific:
   types: TypesPageObject
   appShell: AppShellPageObject
   parts: PartsPageObject
   boxes: BoxesPageObject
   // etc.
   ```
   See refactoring #14 for the solution.

**Template impact:** Template includes the generic test infrastructure files. Apps add their own page objects and test data.

---

## 14. Move domain page objects out of fixtures

**Why:** `tests/support/fixtures.ts` currently defines both infrastructure fixtures (service management, page enhancement, test events) and domain fixtures (page objects for parts, boxes, sellers, etc.). The template needs only the infrastructure.

**Current state:** The fixtures file exports a combined fixture object with both types.

**Action:**

1. Split `fixtures.ts` into two parts:
   - `fixtures-infrastructure.ts` (template-owned): `_serviceManager`, `frontendUrl`, `backendUrl`, `gatewayUrl`, `page` (enhanced), `testEvents`, `toastHelper`, `fileUploadHelper`, `deploymentSse`, `auth`, `backendLogs`, `gatewayLogs`, `frontendLogs`
   - `fixtures.ts` (app-owned, `_skip_if_exists`): Extends infrastructure fixtures with domain page objects (`parts`, `boxes`, `kits`, `sellers`, etc.), `apiClient`, `testData`, domain-specific mocks (`aiAnalysisMock`, `aiCleanupMock`)

2. Pattern:
   ```typescript
   // fixtures-infrastructure.ts (template-owned)
   export const infrastructureFixtures = base.extend<InfrastructureFixtures>({ ... });

   // fixtures.ts (app-owned)
   import { infrastructureFixtures } from './fixtures-infrastructure';
   export const test = infrastructureFixtures.extend<AppFixtures>({ ... });
   ```

This mirrors the backend pattern where `conftest_infrastructure.py` (template-owned) provides base fixtures and `conftest.py` (app-owned) extends them.

**Template impact:** Clean separation. Template owns the infrastructure; app owns the domain fixtures.

---

## 15. Make test `selectors.ts` generic

**Why:** `tests/support/selectors.ts` has both a generic `testId()` helper and domain-specific selectors (parts, types, boxes, sellers).

**Current state:** The file contains:
- `testId(id)` → `[data-testid="id"]` — **generic**
- `buildSelector()` — **generic**
- `selectors.parts`, `selectors.types`, `selectors.boxes`, `selectors.sellers` — **app-specific**

**Action:**
1. Keep `testId()` and `buildSelector()` in `selectors.ts` (template-owned).
2. Move domain selectors to app-owned files, e.g., `selectors-domain.ts`.
3. App-owned file imports and extends the base selectors.

**Template impact:** `selectors.ts` is template-owned with generic helpers. App extends with domain selectors.

---

## 16. Move `types/test-events.ts` to `lib/test/`

**Why:** `src/types/test-events.ts` defines the test event type system (`TestEventKind`, all event interfaces). This is template infrastructure (the test instrumentation framework), not app-specific types. Having it in `src/types/` alongside domain types (`kits.ts`, `shopping-lists.ts`) is confusing.

**Current state:** `src/types/test-events.ts` defines:
- `TestEventKind` enum (ROUTE, FORM, API, TOAST, ERROR, QUERY_ERROR, UI_STATE, SSE, LIST_LOADING)
- Interfaces for each event kind

**Action:** Move to `src/lib/test/test-events.ts` (or `src/lib/test/types.ts`) and update all imports.

**Template impact:** Test event types live with the rest of the test instrumentation in `src/lib/test/`. Clean ownership boundary.

---

## 17. Classify `src/lib/utils/` files

**Why:** Some utilities in `src/lib/utils/` are generic (template candidates) while others are domain-specific.

**Current state:** Files in `src/lib/utils/`:

**Template candidates:**
- `debounce.ts` — `useDebouncedValue` hook (generic)
- `error-parsing.ts` — error parsing helpers (generic)
- `file-validation.ts` — file type/size validation (generic, but only needed with `use_s3`)
- `thumbnail-urls.ts` — CAS URL thumbnail generation (generic, but only needed with `use_s3`)

**App-specific:**
- `locations.ts` — location domain utilities
- `url-metadata.ts` — URL metadata extraction
- `random.ts` — random utilities (review — may be generic)
- `filename-extraction.ts` — filename parsing (review — may be generic)
- `document-transformers.ts` — document transformation
- `ai-parts.ts` — AI parts utilities
- `parts.ts` — parts domain utilities
- `text.ts` — text formatting (review — may be generic)

**Action:**
1. Review each utility and classify as template vs app.
2. Template utilities stay in `src/lib/utils/` and are template-owned.
3. App utilities should move to a domain location (e.g., `src/lib/domain/` or stay but be documented as app-owned).
4. `file-validation.ts` and `thumbnail-urls.ts` should be template-owned but conditional on `use_s3`.

**Template impact:** Template includes generic utilities; app adds its own.

---

## 18. Move template infrastructure tests to the mother project

**Why:** Playwright tests that validate template infrastructure (auth flow, SSE lifecycle, test instrumentation, layout behavior, toast system, deployment notifications) belong in the template's mother project test suite, not in downstream apps. This ensures the template is independently testable and that infrastructure tests run on every template change. Downstream apps should only contain domain-specific tests.

**Current state:** EI's `tests/` directory contains a mix of:
- **Infrastructure tests**: auth flow, SSE connection lifecycle, deployment version tracking, toast notifications, test instrumentation validation, error handling, layout responsiveness
- **Domain tests**: parts CRUD, kits management, shopping lists, boxes, sellers, types, pick-lists, documents, AI analysis

These are currently intermingled — there's no separation between "tests that validate template infrastructure" and "tests that validate EI domain features."

**Action:**

1. **Identify infrastructure tests in EI.** These test template-owned behavior:
   - Auth gate states (loading, error, unauthenticated, authenticated)
   - Auth redirect on 401
   - SSE connection, reconnection, SharedWorker multiplexing
   - Deployment version notification bar
   - Toast show/dismiss lifecycle
   - Test event instrumentation (API events, router events, form events, error events)
   - Layout responsiveness (sidebar collapse, mobile menu)
   - Query client retry behavior

2. **Port infrastructure tests to the template mother project** (`frontend/tests/`). These tests run against the `test-app` (generated from template + `test-app-domain`). They validate that the template's infrastructure works correctly regardless of the domain.

3. **Remove infrastructure tests from EI.** Once they live in the mother project, EI no longer needs to maintain them. EI's test suite should only contain domain tests (parts, kits, shopping lists, etc.).

4. **The mother project's test-app-domain provides minimal domain content** (Items CRUD routes, page objects) — just enough to exercise the infrastructure tests in a realistic context.

**Pattern:** This mirrors the backend template exactly:
- `backend/tests/` (mother project) — tests infrastructure: health endpoints, auth flow, SSE endpoints, S3 endpoints, error handling, metrics
- `backend/test-app/tests/` (domain) — tests Items CRUD only
- Downstream apps only have domain tests; infrastructure tests are maintained by the template

**Template impact:** The template mother project gets a comprehensive Playwright test suite. Downstream apps get lighter test suites focused purely on their domain. Template changes can be validated independently without needing any downstream app.

---

## Summary: File Ownership After Refactoring

### Template-owned (overwritten by `copier update`)

**Core:**
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css` (base theme, generic tokens)
- `src/vite-env.d.ts`
- `src/routes/__root.tsx` (or `.jinja` for provider selection)

**Providers:**
- `src/providers/core-providers.tsx`
- `src/providers/auth-providers.tsx` (when `use_oidc`)
- `src/providers/sse-providers.tsx` (when `use_sse`)

**Contexts:**
- `src/contexts/auth-context.tsx`
- `src/contexts/correlation-context.ts` + `*-base.ts` + `*-provider.tsx`
- `src/contexts/deployment-context.ts` + `*-base.ts` + `*-provider.tsx`
- `src/contexts/sse-context.ts` + `*-base.ts` + `*-provider.tsx`
- `src/contexts/toast-context-base.ts` + `*-provider.tsx`

**Hooks (infrastructure):**
- `src/hooks/use-auth.ts`
- `src/hooks/use-toast.ts`
- `src/hooks/use-sse-task.ts`
- `src/hooks/use-version-sse.ts`
- `src/hooks/use-paginated-fetch-all.ts`

**Lib:**
- `src/lib/api/client.ts`
- `src/lib/api/api-error.ts`
- `src/lib/auth-redirect.ts`
- `src/lib/query-client.ts`
- `src/lib/utils.ts` (cn function)
- `src/lib/config/test-mode.ts`
- `src/lib/config/sse-request-id.ts`
- `src/lib/utils/debounce.ts`
- `src/lib/utils/error-parsing.ts`
- `src/lib/utils/file-validation.ts` (when `use_s3`)
- `src/lib/utils/thumbnail-urls.ts` (when `use_s3`)

**Test instrumentation:**
- `src/lib/test/event-emitter.ts`
- `src/lib/test/api-instrumentation.ts`
- `src/lib/test/console-policy.ts`
- `src/lib/test/error-instrumentation.ts`
- `src/lib/test/form-instrumentation.ts`
- `src/lib/test/query-instrumentation.ts`
- `src/lib/test/router-instrumentation.ts`
- `src/lib/test/toast-instrumentation.ts`
- `src/lib/test/ui-state.ts`
- `src/lib/test/test-events.ts` (moved from `src/types/`)

**Components (infrastructure):**
- `src/components/auth/auth-gate.tsx`
- `src/components/layout/sidebar.tsx` (shell only, reads items from app file)
- `src/components/layout/top-bar.tsx` (reads title from consts)
- `src/components/layout/user-dropdown.tsx`
- `src/components/layout/form-screen-layout.tsx`
- `src/components/layout/detail-screen-layout.tsx`
- `src/components/layout/list-screen-layout.tsx`
- `src/components/layout/list-screen-counts.tsx`
- `src/components/layout/list-section-header.tsx`
- `src/components/ui/*` (template-provided UI components — see note below)

**Workers:**
- `src/workers/sse-worker.ts` (when `use_sse`)

**Scripts:**
- `scripts/generate-api.js`
- `scripts/fetch-openapi.js`
- `scripts/verify-production-build.cjs`

**Config:**
- `vite.config.ts` (`.jinja` for ports and SSE proxy conditional)
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.playwright.json`
- `eslint.config.js`
- `playwright.config.ts`

**Test infrastructure:**
- `tests/support/global-setup.ts`
- `tests/support/fixtures-infrastructure.ts` (new, split from fixtures.ts)
- `tests/support/helpers.ts`
- `tests/support/helpers/test-events.ts`
- `tests/support/helpers/toast-helpers.ts`
- `tests/support/helpers/deployment-sse.ts`
- `tests/support/helpers/file-upload.ts`
- `tests/support/process/servers.ts`
- `tests/support/process/backend-logs.ts`
- `tests/support/process/deployment-reset.ts`
- `tests/support/selectors.ts` (generic helpers only)
- `tests/support/backend-url.ts`

### App-owned (`_skip_if_exists`)

- `src/lib/consts.ts` — project name, title, ports
- `src/app-theme.css` — brand colors, custom CSS tokens
- `src/components/layout/sidebar-nav.ts` — navigation items
- `src/lib/api/generated/` — generated API types/client/hooks
- `src/routes/` (except `__root.tsx`) — all domain routes
- `src/components/` (domain dirs: boxes, kits, parts, sellers, etc.)
- `src/components/ui/` (domain-specific UI components) — see note below
- `src/hooks/` (domain hooks)
- `src/types/` (domain types)
- `src/lib/utils/` (domain utilities)
- `tests/support/fixtures.ts` — extends infrastructure fixtures with domain page objects
- `tests/support/selectors-domain.ts` — domain-specific selectors
- `tests/` (domain test files)
- `package.json` — dependencies
- `Dockerfile`
- `.env.example`
- `public/favicon.png` — app icon

**Note on `src/components/ui/`:** This directory contains both template-owned and app-owned files. The template provides generic UI components (button, card, dialog, form, input, badges, tooltip, alert, skeleton, dropdown-menu, toast, etc.). Apps can add domain-specific UI components to the same directory (e.g., EI's `membership-tooltip-content.tsx`, `membership-indicator.tsx`). Template-owned files are listed explicitly in `copier.yml`; any file not listed is app-owned and won't be overwritten by `copier update`.

---

## Expected `.jinja` Files

After these refactorings, the template should need only these `.jinja` files:

1. **`vite.config.ts.jinja`** — proxy ports, SSE proxy conditional
2. **`package.json.jinja`** — project name, description, author metadata
3. **`index.html.jinja`** — page title from `project_description`
4. **`src/providers/index.ts.jinja`** — barrel for active provider imports (see #6)

Potentially:
5. **`src/routes/__root.tsx.jinja`** — if we need conditional provider imports directly (may not be needed if the providers barrel handles it)

The goal is ≤5 `.jinja` files in the template source.

---

## Priority Order

Recommended implementation order:

1. **#1 Create consts.ts** — foundation for #3
2. **#2 Extract sidebar-nav** — small, high-impact separation
3. **#3 TopBar from consts** — depends on #1
4. **#5 Split index.css** — cleanly separates theme
5. **#6 Extract provider groups** — biggest architectural change
6. **#14 Split fixtures** — critical for test infrastructure
7. **#18 Move template tests to mother project** — critical for template validation
8. **#15 Generic selectors** — required for test infrastructure
9. **#16 Move test-events types** — cleanup
10. **#13 Classify test files** — documentation
11. **#7-12, #17** — smaller changes, can be done during template creation

Items #4 (index.html) requires no EI refactoring — handled at template creation time.
Items #9 and #10 (SSE event generalization) should be reviewed during template creation — they may already be generic enough.
