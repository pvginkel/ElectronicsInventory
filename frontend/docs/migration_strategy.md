# Frontend Template Migration Strategy

This document describes the strategy for creating a Copier-based frontend template and migrating all downstream apps onto it.

## Current State of Frontend Apps

### ElectronicsInventory (Primary Source)
- **Stack**: React 19 + Vite 7 + pnpm + TypeScript (strict)
- **Router**: TanStack Router (file-based, with CLI code generation)
- **Data fetching**: TanStack Query with OpenAPI-generated hooks
- **Styling**: Tailwind CSS 4 (`@tailwindcss/vite` plugin) + Radix UI primitives
- **Auth**: OIDC via backend redirect (BFF pattern)
- **SSE**: SharedWorker-based with direct EventSource fallback, event buffering with 10s TTL
- **Testing**: Playwright with per-worker backend isolation, extensive test instrumentation framework (9 instrumentation modules: API, router, toast, form, error, query, console, UI state, list loading)
- **API generation**: Custom `scripts/generate-api.js` producing types + client + TanStack Query hooks from OpenAPI spec
- **UI components**: 41 reusable components in `src/components/ui/` (shadcn/ui pattern: Radix primitives + Tailwind wrappers)
- **Layout components**: Generic screen layouts (form, detail, list) with test ID conventions
- **Complexity**: Highest — full provider nesting (Query → Toast → Auth → AuthGate → SSE → Deployment → QuerySetup)
- **Refactoring needed**: See `docs/ei_frontend_refactoring.md` for the detailed refactoring plan

### IoTSupport (Close to EI)
- **Stack**: Same as EI (React 19, Vite 7, TanStack Router/Query, Tailwind 4, Radix UI)
- **Auth**: Same OIDC redirect pattern
- **SSE**: Simpler — direct EventSource, no SharedWorker
- **Testing**: Playwright with global setup
- **Domain-specific**: esptool-js for ESP32 firmware flashing (mocked in tests)
- **Gap from template**: Minor — SSE complexity, test instrumentation depth

### DHCPApp (Needs Work)
- **Stack**: React 19, Vite 7, TanStack Router/Query, Radix UI
- **Styling**: Tailwind CSS **3** (traditional config, not v4 plugin)
- **Auth**: Same OIDC redirect pattern
- **SSE**: Custom `SSEClient` class with manual reconnection logic
- **Testing**: **None** — no Playwright, no test instrumentation
- **API generation**: Has `generated/` directory but simpler generation pipeline
- **Gaps**: Tailwind 3→4, no tests, no test instrumentation, manual SSE implementation

### ZigbeeControl (Most Divergent)
- **Stack**: React 19, Vite 7, pnpm
- **Router**: **None** — uses custom tab switching with Zustand store
- **State**: **Zustand** (not TanStack Query contexts)
- **Styling**: CSS modules + inline styles — **no Tailwind, no Radix UI**
- **Auth**: OIDC redirect (same pattern)
- **SSE**: Minimal status hook only
- **Testing**: **None**
- **Domain-specific**: iframe-based dashboard orchestrator (proxies to child apps via dynamic YAML config)
- **Gaps**: Everything — routing, components, styling, testing

## Technology Decisions for Template

Based on the EI patterns (primary source):

| Choice | Technology | Rationale |
|--------|-----------|-----------|
| **Build** | Vite 7 + pnpm | All apps already use this |
| **Framework** | React 19 + TypeScript (strict) | Universal across apps |
| **Router** | TanStack Router (file-based) | Used by 3 of 4 apps; ZC is the outlier |
| **Data fetching** | TanStack Query | Universal across apps |
| **API generation** | openapi-fetch + openapi-typescript + custom hooks generator | EI/IoT pattern, proven at scale |
| **Styling** | Tailwind CSS 4 + @tailwindcss/vite | Modern plugin approach (DHCP needs upgrade from v3) |
| **Components** | Radix UI primitives + custom Tailwind wrappers | EI/IoT/DHCP pattern |
| **Auth** | OIDC redirect via backend (BFF pattern) | Universal across apps |
| **SSE** | SharedWorker + direct EventSource fallback | EI's battle-tested approach |
| **Testing** | Playwright + test instrumentation framework | EI's approach is the gold standard |
| **Linting** | ESLint + TypeScript strict mode | All apps use this |

## Feature Flags (Shared with Backend)

| Flag | Frontend impact |
|------|----------------|
| `use_oidc` | Auth context, auth gate, login redirect, user dropdown, 401 handling |
| `use_s3` | File upload components, file validation, document grid, thumbnail URLs |
| `use_sse` | SSE context provider, SharedWorker, version tracking, task event hooks |

Note: `use_database` is backend-only and has no frontend counterpart.

## Template Architecture

### Consts Pattern

Mirrors the backend's `consts.py`. Each generated app has `src/lib/consts.ts` (app-owned, `_skip_if_exists`):

```typescript
export const PROJECT_NAME = "my-app";
export const PROJECT_TITLE = "My App";
export const PROJECT_DESCRIPTION = "A React frontend application";
export const DEFAULT_BACKEND_PORT = 5000;
export const DEFAULT_SSE_GATEWAY_PORT = 3001;
export const DEFAULT_FRONTEND_PORT = 3000;
```

Template-owned files (TopBar, index.html, etc.) read from consts instead of using Jinja variables, minimizing `.jinja` files.

### Provider Architecture

The root route composes feature-flag-conditional provider groups:

```
CoreProviders (always)
  └── QueryClientProvider → ToastProvider → QuerySetup
AuthProviders (use_oidc)
  └── AuthProvider → AuthGate
SseProviders (use_sse)
  └── SseContextProvider → DeploymentProvider
```

Each provider group lives in its own file under `src/providers/`. The template includes/excludes entire files based on feature flags rather than using Jinja conditionals inside files.

### Theme Architecture

CSS theming uses a two-file approach:
- `src/index.css` (template-owned): Tailwind v4 import, generic design token system (primary, secondary, accent, etc. with neutral defaults), base layer, generic utilities
- `src/app-theme.css` (app-owned): Brand color overrides, app-specific CSS custom properties, app-specific utilities

### File Ownership Model

Mirroring the backend template's approach:

**Template-maintained** (overwritten by `copier update`):

Config files:
- `vite.config.ts` (`.jinja` — proxy ports, SSE conditional)
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` / `tsconfig.playwright.json`
- `eslint.config.js`
- `index.html` (`.jinja` — page title)
- `playwright.config.ts`
- `package.json` (`.jinja` — project metadata)

Core source:
- `src/main.tsx` — React mount point with test instrumentation setup
- `src/App.tsx` — TanStack Router + CorrelationProvider
- `src/index.css` — base Tailwind theme with generic tokens
- `src/routes/__root.tsx` — root route composing providers and app shell

Providers:
- `src/providers/core-providers.tsx` — Query + Toast + QuerySetup (always)
- `src/providers/auth-providers.tsx` — Auth + AuthGate (when `use_oidc`)
- `src/providers/sse-providers.tsx` — SSE + Deployment (when `use_sse`)

Contexts:
- `src/contexts/auth-context.tsx`, `correlation-context*.ts`, `deployment-context*.ts`, `sse-context*.ts`, `toast-context*.ts`

Infrastructure hooks:
- `src/hooks/use-auth.ts`, `use-toast.ts`, `use-sse-task.ts`, `use-version-sse.ts`, `use-paginated-fetch-all.ts`

Lib:
- `src/lib/api/client.ts` — openapi-fetch wrapper with auth middleware
- `src/lib/api/api-error.ts` — structured error class with 401 detection
- `src/lib/auth-redirect.ts` — login URL builder
- `src/lib/query-client.ts` — TanStack Query config (retry logic, staleTime, mutation error toasts)
- `src/lib/utils.ts` — `cn()` classname utility (clsx + tailwind-merge)
- `src/lib/config/test-mode.ts` — test mode detection
- `src/lib/config/sse-request-id.ts` — SSE correlation with test bridge
- `src/lib/utils/debounce.ts`, `error-parsing.ts`
- `src/lib/utils/file-validation.ts`, `thumbnail-urls.ts` (when `use_s3`)

Test instrumentation (9 modules):
- `src/lib/test/event-emitter.ts` — core test event emission
- `src/lib/test/api-instrumentation.ts` — API call tracking with correlation IDs
- `src/lib/test/console-policy.ts` — console error detection
- `src/lib/test/error-instrumentation.ts` — global error + unhandled rejection tracking
- `src/lib/test/form-instrumentation.ts` — form lifecycle tracking
- `src/lib/test/query-instrumentation.ts` — TanStack Query error monitoring
- `src/lib/test/router-instrumentation.ts` — route change tracking
- `src/lib/test/toast-instrumentation.ts` — toast notification tracking
- `src/lib/test/ui-state.ts` — component loading state tracking
- `src/lib/test/test-events.ts` — event type definitions

Components (infrastructure):
- `src/components/auth/auth-gate.tsx` — authentication gate (loading → error → redirect → render)
- `src/components/layout/sidebar.tsx` — collapsible sidebar (reads items from app-owned file)
- `src/components/layout/top-bar.tsx` — app header (reads title from consts)
- `src/components/layout/user-dropdown.tsx` — user profile dropdown with logout
- `src/components/layout/form-screen-layout.tsx` — generic form page layout
- `src/components/layout/detail-screen-layout.tsx` — generic detail page layout
- `src/components/layout/list-screen-layout.tsx` — generic list page layout with sticky header
- `src/components/layout/list-screen-counts.tsx` — item count display with i18n
- `src/components/layout/list-section-header.tsx` — section header component
- `src/components/ui/*` — template-provided Radix+Tailwind components (button, card, dialog, form, input, badges, tooltip, alert, skeleton, dropdown-menu, toast, etc.). Note: apps can add their own UI components to this directory; only template-listed files are overwritten by `copier update`

Workers:
- `src/workers/sse-worker.ts` — SharedWorker for cross-tab SSE multiplexing (when `use_sse`)

Scripts:
- `scripts/generate-api.js` — OpenAPI → types + client + TanStack Query hooks
- `scripts/fetch-openapi.js` — OpenAPI spec fetching with SHA256 cache
- `scripts/verify-production-build.cjs` — checks for test markers in production bundles

Playwright test infrastructure:
- `tests/support/global-setup.ts` — seeded SQLite database initialization
- `tests/support/fixtures-infrastructure.ts` — per-worker service management, page enhancement, test event bridge
- `tests/support/helpers.ts` — generic test helpers (`makeUniqueToken`, `waitTestEvent`, etc.)
- `tests/support/helpers/test-events.ts` — `TestEventBuffer` + `TestEventCapture`
- `tests/support/helpers/toast-helpers.ts` — toast assertion utilities
- `tests/support/helpers/deployment-sse.ts` — SSE connection helpers
- `tests/support/helpers/file-upload.ts` — file upload simulation
- `tests/support/process/servers.ts` — backend/frontend/gateway process management
- `tests/support/process/backend-logs.ts` — log collection and test attachment
- `tests/support/selectors.ts` — generic `testId()` helper and selector builder
- `tests/support/backend-url.ts` — backend URL configuration

**App-maintained** (`_skip_if_exists` — generated once):
- `src/lib/consts.ts` — project name, title, description, ports
- `src/app-theme.css` — brand colors, custom CSS tokens
- `src/components/layout/sidebar-nav.ts` — app-specific navigation items
- `src/lib/api/generated/` — generated API types/client/hooks (regenerated by app)
- `src/routes/` (except `__root.tsx`) — all domain routes
- `src/components/` (domain-specific) — app component directories (including app-specific files in `ui/`)
- `src/hooks/` (domain-specific) — app hooks
- `src/types/` — app type definitions
- `src/lib/utils/` (domain-specific) — app utilities
- `tests/support/fixtures.ts` — extends infrastructure fixtures with domain page objects
- `tests/support/selectors-domain.ts` — domain-specific selectors
- `tests/` (domain test files)
- `package.json` — dependencies (app manages after generation)
- `.env.example` — environment documentation
- `Dockerfile`
- `public/favicon.png` — app icon

### Hook Contract (Frontend Equivalent)

The backend uses `startup.py` hooks. The frontend has equivalent extension points:

1. **Project identity** — app provides name/title via `src/lib/consts.ts`
2. **Navigation items** — app provides sidebar items via `src/components/layout/sidebar-nav.ts`
3. **Brand theme** — app provides color overrides via `src/app-theme.css`
4. **Routes** — app adds file-based routes under `src/routes/`
5. **API layer** — app regenerates `src/lib/api/generated/` from its OpenAPI spec
6. **Custom providers** — app can add domain-specific context providers in the nesting chain
7. **Test fixtures** — app extends `tests/support/fixtures-infrastructure.ts` with domain page objects and test data in `tests/support/fixtures.ts`
8. **Test selectors** — app extends `tests/support/selectors.ts` with domain selectors in `tests/support/selectors-domain.ts`

### Template Variables

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `project_name` | str | required | Package name (kebab-case), used in consts.ts and package.json |
| `project_title` | str | required | Short display title (e.g., "Electronics"), used in TopBar via consts.ts |
| `project_description` | str | "A React frontend application" | Full description, used in consts.ts, package.json, index.html |
| `author_name` | str | required | package.json author |
| `author_email` | str | required | package.json author |
| `repo_url` | str | "" | Git repository URL |
| `backend_port` | int | 5000 | Vite proxy target for `/api`, default in consts.ts |
| `sse_gateway_port` | int | 3001 | Vite proxy target for `/api/sse`, default in consts.ts |
| `frontend_port` | int | 3000 | Vite dev server port |
| `use_oidc` | bool | false | OIDC auth components, providers, user dropdown, 401 handling |
| `use_s3` | bool | false | File upload components, file validation, thumbnail URL utilities |
| `use_sse` | bool | false | SSE context, SharedWorker, version tracking, deployment bar, task event hooks |

### Expected `.jinja` Files

The template aims to minimize Jinja usage. Expected `.jinja` files:

| File | Reason |
|------|--------|
| `vite.config.ts.jinja` | Proxy ports, SSE proxy conditional |
| `package.json.jinja` | Project name, description, author metadata |
| `index.html.jinja` | Page title from `project_description` |
| `src/providers/index.ts.jinja` | Barrel that selects active provider imports based on flags |

All other feature-flag conditionality is handled by file inclusion/exclusion rather than inline Jinja.

## Migration Phases

### Phase 1: Refactor EI Frontend → Extract Template

EI is the primary source. Before extracting the template, refactor EI to cleanly separate infrastructure from domain code.

See **`docs/ei_frontend_refactoring.md`** for the detailed refactoring guide with 17 specific refactorings.

**Key refactorings (priority order):**

1. Create `src/lib/consts.ts` — centralize project name/title/ports (mirrors backend `consts.py`)
2. Extract sidebar navigation items into app-owned `sidebar-nav.ts`
3. Make TopBar read title from consts instead of hardcoding
4. Split `index.css` into base theme (template) + app theme (app-owned)
5. Extract `__root.tsx` provider chain into composable provider groups under `src/providers/`
6. Split Playwright `fixtures.ts` into infrastructure (template) + domain (app) parts
7. Move test event type definitions from `src/types/` to `src/lib/test/`
8. Classify test selectors and utility files

**Already generic (no refactoring needed):**
- All contexts (auth, correlation, deployment, SSE, toast)
- All infrastructure hooks (use-auth, use-toast, use-sse-task, use-version-sse, use-paginated-fetch-all)
- Full test instrumentation framework (9 modules in `src/lib/test/`)
- SSE SharedWorker (cross-tab multiplexing, event buffering, exponential backoff)
- API generation scripts (`generate-api.js`, `fetch-openapi.js`)
- All 41 UI components in `src/components/ui/`
- All layout components (form/detail/list screen layouts)
- Auth gate component
- User dropdown component

**1.3 — Create the template**

```
frontend/
├── copier.yml
├── template/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css                  # Base theme with generic tokens
│   │   ├── {% if use_sse %}app-theme.css{% endif %}  # App-owned theme stub
│   │   ├── routes/
│   │   │   └── __root.tsx             # Composes provider groups + app shell
│   │   ├── providers/
│   │   │   ├── index.ts.jinja         # Barrel selecting active providers by flags
│   │   │   ├── core-providers.tsx     # Query + Toast + QuerySetup (always)
│   │   │   ├── auth-providers.tsx     # Auth + AuthGate (use_oidc)
│   │   │   └── sse-providers.tsx      # SSE + Deployment (use_sse)
│   │   ├── contexts/                  # Auth, toast, SSE, correlation, deployment
│   │   ├── hooks/                     # Infrastructure hooks (5 files)
│   │   ├── lib/
│   │   │   ├── api/                   # Client, error class
│   │   │   ├── config/                # Test mode, SSE request ID
│   │   │   ├── test/                  # Test instrumentation (10 files)
│   │   │   ├── utils/                 # Generic utilities
│   │   │   ├── consts.ts              # _skip_if_exists — project constants
│   │   │   ├── query-client.ts
│   │   │   ├── utils.ts              # cn() function
│   │   │   └── auth-redirect.ts
│   │   ├── components/
│   │   │   ├── auth/                  # Auth gate (use_oidc)
│   │   │   ├── layout/               # Sidebar, top-bar, user-dropdown, screen layouts
│   │   │   └── ui/                   # 41 Radix + Tailwind base components
│   │   └── workers/                   # SSE SharedWorker (use_sse)
│   ├── scripts/
│   │   ├── generate-api.js
│   │   ├── fetch-openapi.js
│   │   └── verify-production-build.cjs
│   ├── tests/
│   │   └── support/
│   │       ├── global-setup.ts
│   │       ├── fixtures-infrastructure.ts  # Per-worker services, page enhancement
│   │       ├── fixtures.ts                 # _skip_if_exists — domain fixtures
│   │       ├── helpers.ts
│   │       ├── helpers/               # Test events, toast, SSE, file upload
│   │       ├── process/               # Service management, log collection
│   │       ├── selectors.ts           # Generic testId() helper
│   │       └── backend-url.ts
│   ├── vite.config.ts.jinja
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── tsconfig.playwright.json
│   ├── eslint.config.js
│   ├── playwright.config.ts
│   ├── package.json.jinja
│   ├── index.html
│   └── Dockerfile.jinja
├── test-app/                          # Generated test app
├── test-app-domain/                   # Domain files for test app
├── tests/                             # Mother project tests
└── regen.sh
```

**1.4 — Build test-app-domain**

Create minimal domain files for the frontend test-app (mirrors backend's Items CRUD):
- `src/lib/consts.ts` — test-app identity
- `src/app-theme.css` — minimal brand colors
- `src/components/layout/sidebar-nav.ts` — Items navigation entry
- A simple "Items" page with list/detail/create/edit routes under `src/routes/items/`
- Generated API hooks for the backend test-app's Items API
- `tests/support/fixtures.ts` — extends infrastructure fixtures with Items page objects
- A basic Playwright test suite covering CRUD operations

**1.5 — Mother project tests**

Frontend mother project tests are full Playwright E2E tests that validate template infrastructure. These are ported from EI's existing infrastructure tests (see `docs/ei_frontend_refactoring.md` #18) and run against the `test-app`:

- Auth gate states (loading, error, unauthenticated, authenticated) when `use_oidc` enabled
- Auth redirect on 401
- Auth components absent when `use_oidc` disabled
- SSE connection, reconnection, SharedWorker multiplexing when `use_sse` enabled
- SSE components absent when `use_sse` disabled
- Deployment version notification bar
- Toast show/dismiss lifecycle
- Test event instrumentation (API events, router events, form events, error events, UI state events)
- Layout responsiveness (sidebar collapse, mobile menu overlay)
- Query client retry and error toast behavior
- API generation script produces valid output
- `npm run build` succeeds for all flag combinations
- No test markers in production bundles (`verify-production-build.cjs`)
- `npm run lint` passes for all flag combinations
- Per-worker backend isolation works correctly

Once these tests exist in the mother project, downstream apps remove their infrastructure tests and keep only domain tests. This matches the backend template pattern exactly.

### Phase 2: Port EI onto the Template

Once the template works:

1. Generate a fresh frontend project:
   ```bash
   cd /work/ModernAppTemplate/frontend
   copier copy . /work/ElectronicsInventory-new/frontend --trust \
     -d project_name=electronics-inventory \
     -d project_title=Electronics \
     -d project_description="Electronics Inventory" \
     -d backend_port=5001 \
     -d use_oidc=true \
     -d use_s3=true \
     -d use_sse=true
   ```

2. Copy EI's domain code into the generated project:
   - `src/routes/` (except `__root.tsx`) — all domain routes (parts, kits, boxes, sellers, shopping-lists, pick-lists, types)
   - `src/components/` (domain dirs: boxes, kits, parts, sellers, shopping-lists, pick-lists, documents, icons, types)
   - `src/hooks/` (domain hooks: use-ai-part-*, use-attachment-*, use-box-*, use-document-*, etc.)
   - `src/types/` (domain types: kits.ts, shopping-lists.ts, pick-lists.ts, locations.ts, documents.ts, ai-parts.ts)
   - `src/lib/utils/` (domain utilities: locations.ts, ai-parts.ts, parts.ts, document-transformers.ts, etc.)
   - `src/lib/api/generated/` (regenerate from EI's OpenAPI spec)

3. Wire up app-owned files:
   - `src/lib/consts.ts` — EI's project identity (already refactored in Phase 1)
   - `src/app-theme.css` — EI's teal color palette and electronics category colors
   - `src/components/layout/sidebar-nav.ts` — EI's 7 navigation items
   - `tests/support/fixtures.ts` — extends infrastructure with EI page objects
   - `tests/support/selectors-domain.ts` — EI-specific selectors
   - `package.json` — add domain-specific dependencies (no new ones expected beyond template)

4. Remove infrastructure tests from EI's test suite (auth flow, SSE lifecycle, toast, layout, etc.) — these now live in the template mother project.

5. Run Playwright domain tests, verify everything works.

6. Swap `frontend-new` → `frontend` when validated.

### Phase 3: Migrate IoTSupport

IoTSupport is closest to EI. Migration should be straightforward.

**Specific concerns:**
- `esptool-js` — domain-specific dependency. Goes in app's `package.json` only
- Vite config: esptool-js mock for test mode → app-specific vite config extension or plugin
- SSE: IoT uses simpler SSE. The template's SharedWorker approach supersedes it — no special handling needed
- Test infrastructure: IoT already has Playwright. Adopt template's test instrumentation framework

**Estimated effort:** Low — mostly moving domain files into the generated structure.

### Phase 4: Migrate DHCPApp

DHCP needs more work but is structurally similar.

**Specific concerns:**
- **Tailwind 3 → 4**: Requires config migration. The `tailwind.config.js` file goes away; Tailwind 4 uses `@tailwindcss/vite` plugin and `@import "tailwindcss"` in CSS
- **Custom SSEClient class → template's SharedWorker SSE**: Replace `src/lib/api/sse-client.ts` with template's SSE context
- **No tests**: Template provides Playwright setup. DHCP needs tests written from scratch
- **Manual API client → OpenAPI generation**: Set up `scripts/generate-api.js` against DHCP's backend OpenAPI spec

**Estimated effort:** Medium — Tailwind migration, SSE rewrite, add tests.

### Phase 5: Migrate ZigbeeControl

ZC is the most divergent. It's fundamentally different — an iframe-based dashboard orchestrator, not a standard CRUD app.

**Specific concerns:**
- **No router** → TanStack Router. ZC's tab system is its routing; needs a route-per-tab model
- **Zustand → TanStack Query + contexts**: Replace Zustand store with TanStack Query for API data and standard contexts for UI state
- **No Tailwind, no Radix → full adoption**: Complete styling rewrite
- **Dynamic iframe proxies from YAML → app-specific vite config**: ZC's unique proxy setup needs to be handled as an app extension
- **No tests** → write tests

**Estimated effort:** High — essentially a rewrite of the UI layer onto the template structure. Domain logic (tab management, iframe lifecycle, restart buttons) ports directly.

**Alternative:** ZC could be the last migration and may benefit from being deferred until the template is stable.

## Execution Order

```
1. Refactor EI frontend (separate infra from domain)     ← Foundation
2. Create frontend template from EI                       ← Template built
3. Create test-app + test-app-domain                      ← Template validated
4. Port EI onto template                                  ← Proof of concept
5. Port IoTSupport                                        ← Easy win
6. Port DHCPApp                                           ← Medium effort
7. Port ZigbeeControl                                     ← Hard, defer if needed
```

## Playwright Test Architecture

The test infrastructure is the most valuable part of the template. It provides deterministic, parallel E2E testing with per-worker service isolation.

### Per-Worker Service Isolation

Each Playwright worker gets its own isolated stack:
```
Worker 0: backend:5100 + gateway:3100 + frontend:3200 (seeded DB copy A)
Worker 1: backend:5101 + gateway:3101 + frontend:3201 (seeded DB copy B)
```

**Global setup** (`global-setup.ts`):
1. Creates a temp directory with `seed.sqlite`
2. Runs backend's `initialize-sqlite-database.sh --load-test-data`
3. Sets `PLAYWRIGHT_SEEDED_SQLITE_DB` env var for worker fixtures

**Per-worker fixture** (`fixtures-infrastructure.ts`):
1. Copies seeded DB to unique temp directory per worker
2. Starts backend, SSE gateway, and frontend with unique ports (via `get-port`)
3. Streams service logs via collectors
4. Enhances `page` fixture with test event bridge, console error tracking, reduced motion
5. Cleans up services in reverse order on teardown

### Test Event Pipeline

Frontend instrumentation emits structured events during operation:
```
Frontend code → emitTestEvent() → Playwright binding → TestEventBuffer → Test assertions
```

Event kinds: `ROUTE`, `FORM`, `API`, `TOAST`, `ERROR`, `QUERY_ERROR`, `UI_STATE`, `SSE`, `LIST_LOADING`

Tests await events deterministically instead of polling DOM or intercepting HTTP:
```typescript
await waitTestEvent(page, 'api', e => e.operation === 'createItem' && e.status === 201);
await waitTestEvent(page, 'toast', e => e.level === 'success');
```

### Template vs App Test Split

There are two dimensions to the split:

**Test support files** (fixtures, helpers, selectors):

| Template-owned (`tests/support/`) | App-owned (`tests/support/`) |
|-----------------------------------|------------------------------|
| `fixtures-infrastructure.ts` — service management, page enhancement | `fixtures.ts` — extends infrastructure with domain page objects |
| `helpers.ts` — `makeUniqueToken`, `waitTestEvent`, etc. | Domain-specific mocks (e.g., AI analysis mock) |
| `helpers/test-events.ts` — TestEventBuffer, TestEventCapture | Domain selectors |
| `helpers/toast-helpers.ts` — toast assertions | Domain test data |
| `helpers/deployment-sse.ts` — SSE connection helpers | |
| `helpers/file-upload.ts` — file upload simulation | |
| `process/servers.ts` — service process management | |
| `process/backend-logs.ts` — log collection | |
| `selectors.ts` — generic `testId()` helper | |

**Test files** (actual Playwright tests):

| Mother project (`frontend/tests/`) | App (`app/tests/`) |
|-------------------------------------|--------------------|
| Auth gate states, redirect on 401 | Domain CRUD tests (e.g., parts, kits) |
| SSE connection lifecycle | Domain-specific workflow tests |
| Deployment notification bar | Domain-specific UI tests |
| Toast lifecycle | |
| Test instrumentation validation | |
| Layout responsiveness | |
| Query error handling | |

Infrastructure tests live **only** in the template mother project. Downstream apps contain **only** domain tests. When an app is ported onto the template, its infrastructure tests are removed — they are already covered by the mother project's suite.

## Validation Strategy

### Per-template validation
```bash
cd /work/ModernAppTemplate/frontend
bash regen.sh
cd test-app && npx playwright test      # E2E tests
npm run build                            # Build succeeds
npm run lint                             # Linting passes
```

### Cross-template validation
```bash
cd /work/ModernAppTemplate
bash validate.sh    # Regenerates both test-apps, runs all test suites
```

### Flag combination validation
Generate projects with key flag combinations and verify:
- `npm run build` succeeds
- No TypeScript errors
- No import resolution failures

Key combinations:
- All flags true (maximum complexity)
- OIDC only (auth without SSE/S3)
- SSE only (real-time without auth)
- Minimal (no flags — bare React app)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| EI refactoring takes longer than expected | Medium | High | Start with clear infra/domain file classification; extract incrementally |
| Tailwind 3→4 migration breaks DHCP styling | Medium | Medium | Tailwind has a migration guide; test visually |
| ZC iframe model doesn't fit template | High | Low | ZC can stay on custom stack if template doesn't fit; or use template for non-iframe parts only |
| OpenAPI generation script needs per-app customization | Low | Medium | Script is already generic in EI; parameterize any EI-specific logic |
| Test instrumentation is too EI-specific | Low | Medium | Audit each instrumentation module for generality before extraction |

## Resolved Decisions

1. **Should the frontend template own `src/components/ui/`?** **Yes — template-owned.** Analysis of EI's 41 UI components shows they are all generic (no app-specific logic). They follow the shadcn/ui pattern (Radix primitives + Tailwind wrappers). Template maintains them; apps that need customization can override individual components, but most won't need to.

2. **How should the API generation script handle app-specific customizations?** **No changes needed.** The `generate-api.js` script is already fully generic — it reads any OpenAPI spec and generates types + client + TanStack Query hooks. EI's shopping-lists subdirectory in `lib/api/` contains hand-written custom query hooks that sit alongside the generated code, which is the intended app extension pattern.

3. **How should the CSS theme work?** **Two-file approach.** `index.css` (template-owned) provides the generic design token system with neutral defaults. `app-theme.css` (app-owned) overrides CSS custom properties for brand colors and adds app-specific utilities.

## Open Questions

1. **Should ZC adopt TanStack Router or keep custom tab routing?** ZC's tab model is fundamentally different from page-based routing. Forcing TanStack Router may add complexity without benefit. Consider keeping ZC as a "light" template consumer that uses infrastructure (auth, build, lint) but not routing.

2. **Should `index.html` use Jinja or dynamic title?** Two options: (A) set `document.title` from consts in `main.tsx` (no `.jinja`), or (B) accept a trivial `index.html.jinja` with `<title>{{ project_description }}</title>`. Either works. See `docs/ei_frontend_refactoring.md` #4.

3. **How should the Playwright test infrastructure handle the backend test-app?** The frontend test-app needs a running backend. Options: (A) the frontend `regen.sh` also regenerates the backend test-app, (B) a shared `validate.sh` at the parent repo level orchestrates both, (C) the frontend test-app uses a mock API server. Recommendation: Option B — the parent repo's `validate.sh` already exists and can coordinate.
