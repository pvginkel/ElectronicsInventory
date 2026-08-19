# OIDC Frontend Integration -- Technical Plan

## 0) Research Log & Findings

### Searched Areas

- **Target codebase** (`/work/ElectronicsInventory/frontend`):
  - `scripts/generate-api.js` -- current code generator; lacks auth middleware in `generateClient()` and does not pass `response.status` to `toApiError()` in hook templates.
  - `src/lib/api/api-error.ts` -- `toApiError(error)` accepts one argument; no optional `status` parameter.
  - `src/lib/api/generated/client.ts` -- bare `openapi-fetch` client with no middleware.
  - `src/lib/api/generated/hooks.ts` -- `useGetAuthSelf` hook exists (line 602) but calls `toApiError(error)` without passing `result.response.status`.
  - `src/routes/__root.tsx` -- provider stack is `QueryClientProvider > ToastProvider > SseContextProvider > DeploymentProvider > QuerySetup > AppShellFrame`. No auth provider present.
  - `src/components/layout/sidebar.tsx` -- contains header section (logo, title, collapse toggle) on lines 44-64 plus navigation items.
  - `src/contexts/` -- existing contexts: toast, sse, deployment, correlation. No auth context.
  - `src/hooks/` -- 45 custom hooks following `use-*.ts` naming. No auth hook.
  - `src/types/test-events.ts` -- `UiStateTestEvent` supports `scope` string and phases including `loading`, `ready`, `error`, `submit`; suitable for auth instrumentation.
  - `src/lib/test/event-emitter.ts` -- `emitTestEvent()` function ready for use.
  - `src/lib/config/test-mode.ts` -- `isTestMode()` available.
  - `tests/support/fixtures.ts` -- no `auth` fixture; page fixture suppresses passive-event-listener errors, 409/conflict, 404; does not suppress 401/403/500 errors.
  - `tests/api/` -- factories exist for types, parts, boxes, sellers, shopping lists, kits, attachments. No auth factory.
  - `src/components/ui/button.tsx` -- supports `variant="primary"` used by auth-gate retry button.

- **Source codebase** (`/work/IoTSupport/frontend`):
  - All 14 source files read and compared against target equivalents.
  - Key differences identified: IoTSupport has no SSE or Deployment providers; ElectronicsInventory has both, plus a correlation context.
  - IoTSupport `AuthProvider` (lines 88-108) includes a 401 redirect effect -- the brief specifies this must be **removed** for ElectronicsInventory since the client middleware handles it.
  - IoTSupport sidebar (no header) uses `w-0 overflow-hidden` for collapse; ElectronicsInventory sidebar uses `w-20` for collapsed state with icon-only display.
  - IoTSupport test fixtures require `auth.createSession()` in each domain factory; ElectronicsInventory must NOT do this (OIDC disabled in test backend).

### Key Conflicts Resolved

1. **Dual 401 redirect**: IoTSupport `auth-context.tsx` lines 88-108 redirect on `isUnauthenticated`. The design decision eliminates this -- the `openapi-fetch` middleware in `client.ts` is the sole 401 handler. The ElectronicsInventory `AuthProvider` will omit this effect entirely.
2. **Sidebar collapse behavior**: IoTSupport collapses to 0 width; ElectronicsInventory currently collapses to icon-only (w-20). After this change, the sidebar loses its header but keeps icon-only collapse behavior with the hamburger moving to the TopBar. The `onToggle` prop is removed; `isCollapsed` stays.
3. **Provider ordering**: ElectronicsInventory has SSE and Deployment providers that must be guarded by auth. New stack: `QueryClientProvider > ToastProvider > AuthProvider > AuthGate > SseContextProvider > DeploymentProvider > QuerySetup > AppShellFrame`.

---

## 1) Intent & Scope

**User intent**

Port the OIDC authentication frontend from the IoTSupport app to the ElectronicsInventory app, adding a 401-intercepting API middleware, auth context/gate, top-bar layout with user dropdown, and minimal test infrastructure -- while ensuring existing tests remain unaffected since OIDC is disabled in the test backend.

**Prompt quotes**

- "The `openapi-fetch` middleware in client.ts is the SOLE authority for 401-to-login redirects. The AuthProvider must NOT also redirect on 401"
- "Provider ordering in __root.tsx: QueryClient > Toast > AuthProvider > AuthGate > SSE > Deployment > QuerySetup > AppShellFrame"
- "DeploymentNotificationBar renders ABOVE the TopBar"
- "Sidebar loses its header (logo, title, toggle button) -- those move to the TopBar"
- "Do NOT modify existing fixtures to require auth. OIDC is disabled in test backend"

**In scope**

- Update code generator (`generate-api.js`) to produce auth middleware in `client.ts` and pass `response.status` to `toApiError()` in `hooks.ts`
- Regenerate all API files (`client.ts`, `hooks.ts`, `types.ts`)
- Add optional `status` parameter to `toApiError()` in `api-error.ts`
- Create `auth-redirect.ts`, `use-auth.ts`, `auth-context.tsx`, `auth-gate.tsx`
- Create `top-bar.tsx` and `user-dropdown.tsx` layout components
- Modify `sidebar.tsx` to remove header, keeping navigation-only
- Restructure `__root.tsx` provider stack and layout
- Create `tests/api/factories/auth.ts`, update `tests/support/fixtures.ts` with auth fixture and console error suppression
- Create `tests/e2e/auth/AuthPage.ts` page object and `tests/e2e/auth/auth.spec.ts`

**Out of scope**

- Backend OIDC implementation (already done)
- Role-based access control or permission gating beyond authentication
- Modifying existing test fixtures to require auth sessions
- Changes to existing domain page objects or test specs (except `AppShellPage` which requires locator updates due to layout restructuring)

**Assumptions / constraints**

- The backend test mode auto-authenticates all requests when OIDC is disabled, so existing tests pass without auth sessions.
- The `UserInfoResponseSchema_a535b8c` type alias is available from the generated hooks (confirmed at `hooks.ts:237`).
- The `buildLoginUrl()` redirect path uses `/api/auth/login?redirect=<encoded>`, matching the backend's OIDC login endpoint.
- The `ulid` package used in IoTSupport's AuthFactory is available or can be added as a dev dependency.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Code generator (`scripts/generate-api.js`) updated to produce client.ts with 401 auth middleware and hooks.ts with `response.status` passed to `toApiError()`
- [ ] API regenerated using updated generator (client.ts, hooks.ts, types.ts all regenerated)
- [ ] `src/lib/api/api-error.ts` updated so `toApiError(error, status?)` accepts and attaches an optional HTTP status
- [ ] `src/lib/auth-redirect.ts` created with `buildLoginUrl()` utility
- [ ] `src/hooks/use-auth.ts` created wrapping `useGetAuthSelf` with 401 detection and `UserInfo` model
- [ ] `src/contexts/auth-context.tsx` created with AuthProvider, AuthContext, useAuthContext -- no duplicate 401 redirect (middleware handles it)
- [ ] `src/components/auth/auth-gate.tsx` created with loading/error/authenticated states
- [ ] `src/components/layout/top-bar.tsx` created with full-width header: hamburger, logo+title link, spacer, UserDropdown
- [ ] `src/components/layout/user-dropdown.tsx` created with user name display, dropdown toggle, and logout functionality
- [ ] `src/components/layout/sidebar.tsx` modified to remove header (logo, title, toggle) -- navigation-only
- [ ] `src/routes/__root.tsx` restructured: AuthProvider+AuthGate inserted after ToastProvider and before SseContextProvider; AppShellFrame layout changed to TopBar above sidebar+content
- [ ] DeploymentNotificationBar renders above the TopBar
- [ ] `tests/api/factories/auth.ts` created with AuthFactory (createSession, clearSession, forceError)
- [ ] `tests/support/fixtures.ts` updated with auth fixture and 401/403/500 console error suppression
- [ ] `tests/e2e/auth/AuthPage.ts` page object created
- [ ] `tests/e2e/auth/auth.spec.ts` created with focused auth flow tests
- [ ] Existing tests still pass without auth sessions (OIDC disabled in test backend)

---

## 2) Affected Areas & File Map

### Generator and API Layer

- **Area**: `scripts/generate-api.js` -- `generateClient()` function
- **Why**: Must emit auth middleware that intercepts 401 responses and redirects via `buildLoginUrl()`. Must also handle dots in `transformOperationId` and query params on mutation hooks.
- **Evidence**: Current `generateClient()` at line 52-69 produces a bare client without middleware. IoTSupport version at line 52-85 includes `authMiddleware` with 401 interception.

- **Area**: `scripts/generate-api.js` -- `generateQueryHook()` and `generateMutationHook()` functions
- **Why**: Must change hook templates to capture `result.response.status` and pass it to `toApiError(result.error, result.response.status)`.
- **Evidence**: Current `generateQueryHook()` at line 170-171 uses `const { data, error } = await api.GET(...)` then `throw toApiError(error)`. IoTSupport version at line 185-186 uses `const result = await api.GET(...) as { data?: unknown; error?: unknown; response: Response }` then `throw toApiError(result.error, result.response.status)`.

- **Area**: `scripts/generate-api.js` -- `transformOperationId()` function
- **Why**: Must handle dots in operation IDs (e.g., `.json` extensions) to produce valid TypeScript identifiers.
- **Evidence**: Current line 290 replaces only hyphens: `baseName.replace(/-/g, '_')`. IoTSupport version at line 318 replaces hyphens and dots: `baseName.replace(/[-\.]/g, '_')`.

- **Area**: `scripts/generate-api.js` -- `generateMutationHook()` for query parameters
- **Why**: Must detect and wire through query parameters on mutation endpoints (e.g., `hasQueryParams`).
- **Evidence**: Current `generateMutationHook()` at lines 182-246 only handles `hasPathParams` and `hasBody`. IoTSupport version at lines 197-274 adds `hasQueryParams` detection and wiring.

- **Area**: `src/lib/api/generated/client.ts` (regenerated)
- **Why**: After generator update, this file gains the auth middleware import and registration.
- **Evidence**: Current file at lines 1-12 is a bare client. Will be replaced by generator output matching IoTSupport lines 56-81.

- **Area**: `src/lib/api/generated/hooks.ts` (regenerated)
- **Why**: All hooks gain `result.response.status` pass-through to `toApiError()`.
- **Evidence**: Current `useGetAuthSelf` at line 607-608 uses `const { data, error } = ...` pattern. Will change to `const result = ...` pattern.

- **Area**: `src/lib/api/generated/types.ts` (regenerated)
- **Why**: Regenerated as part of the standard `pnpm generate:api` pipeline. No structural changes expected.
- **Evidence**: Standard regeneration output.

### Error Handling

- **Area**: `src/lib/api/api-error.ts` -- `toApiError()` function
- **Why**: Must accept optional `status` parameter and attach it to the error, enabling `isUnauthorizedError()` detection in `useAuth`.
- **Evidence**: Current signature at line 38: `toApiError(error: unknown): Error`. IoTSupport version at line 42: `toApiError(error: unknown, status?: number): Error`.

- **Area**: `src/lib/api/api-error.ts` -- `isUnauthorizedError()` function (new export)
- **Why**: Provides a type-safe predicate for detecting 401 errors. Used by `useAuth()` to distinguish "not logged in" from real failures, ensuring `effectiveError` filters out 401s and `isUnauthenticated` is set correctly. Without this function, the `useAuth` hook cannot differentiate 401 from other errors.
- **Evidence**: IoTSupport `src/lib/api/api-error.ts` exports `isUnauthorizedError(error: unknown): boolean` checking `error instanceof ApiError && error.status === 401`. The function does not currently exist in the ElectronicsInventory codebase (confirmed by searching `src/`).

### Auth Infrastructure (new files)

- **Area**: `src/lib/auth-redirect.ts` (new)
- **Why**: Provides `buildLoginUrl()` shared by the client middleware and (optionally) other consumers. Encodes current pathname+search as redirect parameter.
- **Evidence**: Port from IoTSupport `src/lib/auth-redirect.ts` (15 lines, identical).

- **Area**: `src/hooks/use-auth.ts` (new)
- **Why**: Wraps `useGetAuthSelf` with 401 detection, transforms API response to `UserInfo` model, exposes auth state.
- **Evidence**: Port from IoTSupport `src/hooks/use-auth.ts`. The `UserInfoResponseSchema_a535b8c` type alias is confirmed at `hooks.ts:237`.

- **Area**: `src/contexts/auth-context.tsx` (new)
- **Why**: Provides `AuthContext`, `useAuthContext()`, and `AuthProvider` to the component tree with test instrumentation.
- **Evidence**: Port from IoTSupport `src/contexts/auth-context.tsx` with critical change: remove the `isUnauthenticated` redirect effect (lines 88-108) since middleware handles it.

- **Area**: `src/components/auth/auth-gate.tsx` (new)
- **Why**: Blocks rendering until auth resolves; shows error screen with retry for non-401 failures.
- **Evidence**: Port from IoTSupport `src/components/auth/auth-gate.tsx` (161 lines). Uses `Button` from `@/components/ui/button` with `variant="primary"` (confirmed available).

### Layout Components

- **Area**: `src/components/layout/top-bar.tsx` (new)
- **Why**: Full-width header bar containing hamburger, logo+title link, spacer, and UserDropdown.
- **Evidence**: Port from IoTSupport `src/components/layout/top-bar.tsx` with adaptations: title changes from "IoT Support" to "Electronics", alt text changes, app-specific styling preserved.

- **Area**: `src/components/layout/user-dropdown.tsx` (new)
- **Why**: Displays user name, toggles dropdown with logout action, handles outside-click and Escape dismissal.
- **Evidence**: Port from IoTSupport `src/components/layout/user-dropdown.tsx` (127 lines, portable as-is).

- **Area**: `src/components/layout/sidebar.tsx` (modify)
- **Why**: Remove the header section (logo, title, collapse toggle button) -- these move to TopBar. Keep all navigation items and responsive behavior. Remove `onToggle` from `SidebarProps`.
- **Evidence**: Current header block at lines 44-64 (the `{/* Logo/Header */}` section). Navigation section at lines 67-95 is kept. The IoTSupport sidebar (no header, navigation-only) is the target shape, but with ElectronicsInventory's 7 nav items and icon-only collapsed state retained.

### Root Route

- **Area**: `src/routes/__root.tsx` (modify)
- **Why**: Insert `AuthProvider` and `AuthGate` into the provider stack; restructure `AppShellFrame` to use `TopBar` instead of the mobile toggle bar; adjust hamburger to dispatch based on viewport.
- **Evidence**: Current provider stack at lines 34-45. Current `AppShellFrame` at lines 48-127 with mobile toggle at lines 98-116. IoTSupport `__root.tsx` shows target structure at lines 28-39 (providers) and lines 46-122 (shell frame).

### Test Infrastructure

- **Area**: `tests/api/factories/auth.ts` (new)
- **Why**: Provides `AuthFactory` with `createSession`, `clearSession`, `forceError` methods for Playwright tests using backend test endpoints. **Note**: Unlike other factories that use the shared Node.js `createApiClient`, `AuthFactory` requires `page.request` to share session cookies with the Playwright browser context. This means it cannot be wired into `createTestDataBundle` and instead must be a standalone page-scoped fixture (similar to `deploymentSse`). The `tests/api/index.ts` barrel file does NOT need updating for this factory.
- **Evidence**: Port from IoTSupport `tests/api/factories/auth.ts` (72 lines). Uses `page.request` to share cookies with browser context. Existing factories at `tests/api/index.ts:25-117` use `createApiClient` -- a different pattern.

- **Area**: `tests/support/fixtures.ts` (modify)
- **Why**: Add `auth` fixture to `TestFixtures` type as a standalone page-scoped fixture (not part of `testData`). The `auth` fixture receives `page` and instantiates `AuthFactory` with `page.request`. Also add auth-scoped console error suppression to the page fixture -- suppression patterns should be narrowly scoped to messages containing `/api/auth/` or auth-specific status text, rather than blanket 401/403/500 suppression, to avoid masking genuine errors in non-auth tests.
- **Evidence**: Current `TestFixtures` at lines 64-96 lacks `auth`. Current page fixture at lines 169-251 suppresses passive events, 409, 404 but not auth-related errors. Pattern should follow the narrow approach of existing suppressions (e.g., checking for specific text like `text.includes('401') && text.includes('/api/auth/')`).

- **Area**: `tests/e2e/auth/AuthPage.ts` (new)
- **Why**: Page object for auth-related test locators and actions.
- **Evidence**: Port from IoTSupport `tests/e2e/auth/AuthPage.ts` (188 lines, portable as-is).

- **Area**: `tests/e2e/auth/auth.spec.ts` (new)
- **Why**: Focused auth flow tests covering loading, error+retry, user display, dropdown, logout, sidebar toggle, mobile menu, top bar layout.
- **Evidence**: Port from IoTSupport `tests/e2e/auth/auth.spec.ts` with adaptations: title text "Electronics" instead of "IoT Support", home link navigation target changed from `/devices` to `/parts` (the default route in ElectronicsInventory).

- **Area**: `tests/support/page-objects/app-shell-page.ts` (modify)
- **Why**: The layout restructuring removes the sidebar header toggle and the mobile toggle bar, replacing them with the TopBar hamburger. The existing `AppShellPage` locators `desktopToggle` (`app-shell.sidebar.toggle`), `mobileToggleContainer` (`app-shell.mobile-toggle`), and `mobileToggleButton` (`app-shell.mobile-toggle.button`) will no longer match any DOM elements. These must be replaced with TopBar-based locators (e.g., `app-shell.topbar.hamburger`). The `toggleDesktopSidebar()` and `openMobileMenu()` methods must be updated to use the new hamburger button.
- **Evidence**: Current `app-shell-page.ts` lines 9-27 define the affected locators. Lines 57-78 define the methods that use them. After the layout change, the hamburger lives in the TopBar and dispatches to either sidebar toggle or mobile menu based on viewport width.

---

## 3) Data Model / Contracts

- **Entity / contract**: `UserInfoResponseSchema_a535b8c` (API response)
- **Shape**:
  ```json
  {
    "subject": "string",
    "name": "string | null",
    "email": "string | null",
    "roles": ["string"]
  }
  ```
- **Mapping**: Direct mapping to frontend `UserInfo` model (fields are already compatible names). The `transformUserInfo()` function in `use-auth.ts` performs the identity mapping for consistency with the project's hook pattern.
- **Evidence**: `src/lib/api/generated/hooks.ts:237` -- type alias; IoTSupport `src/hooks/use-auth.ts:37-44` -- transform function.

- **Entity / contract**: `UserInfo` (frontend model)
- **Shape**:
  ```typescript
  interface UserInfo {
    email: string | null
    name: string | null
    roles: string[]
    subject: string
  }
  ```
- **Mapping**: Produced by `useAuth()` hook from API response.
- **Evidence**: IoTSupport `src/hooks/use-auth.ts:13-18`.

- **Entity / contract**: `AuthContextValue` (React context value)
- **Shape**:
  ```typescript
  interface AuthContextValue {
    user: UserInfo | null
    isLoading: boolean
    isAuthenticated: boolean
    error: Error | null
    logout: () => void
    refetch: () => void
  }
  ```
- **Mapping**: Assembled by `AuthProvider` from `useAuth()` return value plus `performLogout` function.
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:17-24`.

- **Entity / contract**: `ApiError.status` (enhanced field)
- **Shape**: `status?: number` on `ApiError` class, now populated by `toApiError(error, status)` from the response's HTTP status code.
- **Mapping**: The `status` parameter overrides any status parsed from the body, providing a more reliable source.
- **Evidence**: Current `src/lib/api/api-error.ts:8` already has `status?: number` field; IoTSupport version at line 42-56 shows the override logic.

---

## 4) API / Integration Surface

- **Surface**: `GET /api/auth/self` / `useGetAuthSelf`
- **Inputs**: None (cookie-based authentication)
- **Outputs**: `UserInfoResponseSchema_a535b8c` on 200; 401 on unauthenticated; 5xx on server error.
- **Errors**: 401 is intercepted by client middleware (redirect to login). Non-401 errors surface through `useAuth()` as `error` state. The `AuthGate` displays status-specific error messaging.
- **Evidence**: `src/lib/api/generated/hooks.ts:599-613` -- existing hook; `docs/features/oidc_frontend/change_brief.md` section 4.

- **Surface**: `GET /api/auth/login?redirect=<encoded_path>` (browser navigation, not API call)
- **Inputs**: `redirect` query parameter with URL-encoded current path.
- **Outputs**: Backend initiates OIDC flow, redirects browser to identity provider.
- **Errors**: N/A (full-page redirect).
- **Evidence**: IoTSupport `src/lib/auth-redirect.ts:11-15`.

- **Surface**: `GET /api/auth/logout` (browser navigation)
- **Inputs**: None.
- **Outputs**: Backend clears session and redirects to post-logout page.
- **Errors**: N/A (full-page redirect).
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:47-49`.

- **Surface**: `POST /api/testing/auth/session` (test-only)
- **Inputs**: `{ subject, name, email, roles }` JSON body.
- **Outputs**: 200 on success, sets session cookie.
- **Errors**: Non-200 throws in `AuthFactory.createSession()`.
- **Evidence**: IoTSupport `tests/api/factories/auth.ts:29-42`.

- **Surface**: `POST /api/testing/auth/clear` (test-only)
- **Inputs**: None.
- **Outputs**: 200 on success.
- **Errors**: Non-200 throws in `AuthFactory.clearSession()`.
- **Evidence**: IoTSupport `tests/api/factories/auth.ts:48-57`.

- **Surface**: `POST /api/testing/auth/force-error?status=<code>` (test-only)
- **Inputs**: `status` query parameter (HTTP status code).
- **Outputs**: 200 on success. Next call to `/api/auth/self` returns the forced status.
- **Errors**: Non-200 throws in `AuthFactory.forceError()`.
- **Evidence**: IoTSupport `tests/api/factories/auth.ts:63-71`.

---

## 5) Algorithms & UI Flows

### Auth Initialization Flow

- **Flow**: App boot authentication check
- **Steps**:
  1. `RootLayout` renders provider stack: `QueryClientProvider > ToastProvider > AuthProvider > AuthGate > ...`
  2. `AuthProvider` mounts, calling `useAuth()` which invokes `useGetAuthSelf()` with `retry: false`, `staleTime: Infinity`, `refetchOnWindowFocus: false`.
  3. `useGetAuthSelf` fires `GET /api/auth/self`.
  4. `AuthGate` reads `isLoading=true` from context, renders blank screen (`data-testid="auth.gate.loading"`).
  5a. **200 response**: `useAuth` transforms data to `UserInfo`. `AuthProvider` emits `ui_state:auth:ready` test event. `AuthGate` renders children (SSE, Deployment, AppShellFrame).
  5b. **401 response**: The `openapi-fetch` middleware intercepts the 401, calls `window.location.href = buildLoginUrl()`. Browser navigates to OIDC login. The `useAuth` hook also sees a 401 error but `AuthGate` simply shows blank (redirect already in progress).
  5c. **5xx/network error**: `useAuth` surfaces error (non-401). `AuthProvider` emits `ui_state:auth:error` test event. `AuthGate` shows error screen with status-specific messaging and retry button.
- **States / transitions**: `loading -> authenticated | error | redirecting`
- **Hotspots**: The middleware redirect fires before React Query can process the error. This is intentional -- it prevents a brief flash of the error screen before redirect.
- **Evidence**: IoTSupport `src/routes/__root.tsx:28-39` (provider stack); `src/components/auth/auth-gate.tsx:140-161` (gate logic); `src/hooks/use-auth.ts:70-103` (hook logic).

### Logout Flow

- **Flow**: User-initiated logout
- **Steps**:
  1. User clicks the user name trigger in `UserDropdown`.
  2. Dropdown opens, showing "Logout" button.
  3. User clicks "Logout".
  4. `handleLogout()` calls `logout()` from `useAuthContext()`, which executes `window.location.href = '/api/auth/logout'`.
  5. Browser navigates to backend logout endpoint, which clears the session and redirects.
- **States / transitions**: `dropdown-closed -> dropdown-open -> navigating-away`
- **Hotspots**: None. Full-page navigation; no async coordination needed.
- **Evidence**: IoTSupport `src/components/layout/user-dropdown.tsx:59-62`.

### Error Retry Flow

- **Flow**: Retry after auth check failure
- **Steps**:
  1. `AuthGate` shows error screen with retry button.
  2. User clicks "Retry" (`data-testid="auth.gate.error.retry"`).
  3. `onRetry` calls `refetch()` from `useAuthContext()`, which calls `query.refetch()` on the underlying `useGetAuthSelf` query.
  4. Flow returns to Auth Initialization step 3.
- **States / transitions**: `error -> loading -> authenticated | error`
- **Hotspots**: None.
- **Evidence**: IoTSupport `src/components/auth/auth-gate.tsx:88,141-151`.

### Hamburger Menu Toggle Flow

- **Flow**: TopBar hamburger button dispatches to sidebar or mobile menu
- **Steps**:
  1. User clicks hamburger button in TopBar.
  2. `handleMenuToggle()` in `AppShellFrame` checks `window.innerWidth < 1024`.
  3a. **Desktop**: Calls `toggleSidebar()`, updating `sidebarCollapsed` state. Sidebar transitions between expanded (`w-64`) and collapsed (`w-20`, icon-only) states.
  3b. **Mobile**: Calls `toggleMobileMenu()`, toggling `mobileMenuOpen` state. Overlay with sidebar appears/disappears.
- **States / transitions**: Desktop: `expanded <-> collapsed`. Mobile: `closed <-> open`.
- **Hotspots**: `window.innerWidth` check is a point-in-time measurement, not reactive. This matches the IoTSupport pattern and is acceptable.
- **Evidence**: IoTSupport `src/routes/__root.tsx:65-73` (handleMenuToggle).

---

## 6) Derived State & Invariants

- **Derived value**: `isUnauthenticated`
  - **Source**: Computed in `useAuth()` as `!isLoading && is401` where `is401 = isUnauthorizedError(error)`.
  - **Writes / cleanup**: In the IoTSupport version, this triggers a redirect effect. In ElectronicsInventory, this value is **not acted upon by the provider** because the client middleware handles 401 redirects. The `AuthGate` treats `!isAuthenticated && !error` as "redirect in progress" and shows a blank screen.
  - **Guards**: Only set to `true` after loading completes and error is confirmed as 401.
  - **Invariant**: Must never be `true` simultaneously with `isAuthenticated`.
  - **Evidence**: IoTSupport `src/hooks/use-auth.ts:90`.

- **Derived value**: `effectiveError`
  - **Source**: Computed in `useAuth()` as `error && !is401 ? error : null`. Filters out 401 errors since those represent "not logged in" rather than a failure condition.
  - **Writes / cleanup**: Surfaces as `error` in `AuthContextValue`, consumed by `AuthGate` to display error screen.
  - **Guards**: The 401 filter prevents the error screen from flashing during redirect.
  - **Invariant**: Must be `null` when the error is a 401. Must be non-null for any other error status.
  - **Evidence**: IoTSupport `src/hooks/use-auth.ts:93`.

- **Derived value**: `displayName`
  - **Source**: Computed in `UserDropdown` from `user?.name ?? null` via `getDisplayName()`.
  - **Writes / cleanup**: Rendered as text in the dropdown trigger button.
  - **Guards**: Falls back to "Unknown User" for null/empty/whitespace names.
  - **Invariant**: Must always produce a non-empty string.
  - **Evidence**: IoTSupport `src/components/layout/user-dropdown.tsx:13-18,29`.

- **Derived value**: `sidebarCollapsed` / `mobileMenuOpen`
  - **Source**: Local `useState` in `AppShellFrame`. Toggled by `handleMenuToggle()` based on viewport width.
  - **Writes / cleanup**: Drive sidebar width class and mobile overlay visibility. `mobileMenuOpen` is reset to `false` on navigation via `handleNavigation()`.
  - **Guards**: Viewport check in `handleMenuToggle` prevents desktop toggle from affecting mobile state and vice versa.
  - **Invariant**: `mobileMenuOpen` must be reset on any route navigation to prevent stale overlay.
  - **Evidence**: IoTSupport `src/routes/__root.tsx:47-73`; current `src/routes/__root.tsx:49-61`.

---

## 7) State Consistency & Async Coordination

- **Source of truth**: TanStack Query cache for auth state (key: `['getAuthSelf']`), React context for derived auth values.
- **Coordination**: `useAuth()` wraps the query with `staleTime: Infinity` and `refetchOnWindowFocus: false`, making the auth state effectively immutable after initial fetch. The `AuthProvider` assembles context from hook output. The `AuthGate` reads context and gates rendering.
- **Async safeguards**: `retry: false` prevents automatic retries on auth failure (including 401). The middleware redirect fires synchronously in the response handler, before React Query processes the error -- this prevents race conditions where the error screen briefly appears before redirect.
- **Instrumentation**: `AuthProvider` emits `UiStateTestEvent` with `scope: 'auth'` and phases `loading`, `ready`, `error`. These events are guarded by `isTestMode()` and fire in a `useEffect` keyed on `[isLoading, isAuthenticated, user, error]`.
- **Evidence**: IoTSupport `src/hooks/use-auth.ts:71-78` (query options); `src/contexts/auth-context.tsx:59-86` (instrumentation effect).

---

## 8) Errors & Edge Cases

- **Failure**: GET /api/auth/self returns 401 (unauthenticated)
- **Surface**: `openapi-fetch` middleware in `client.ts`
- **Handling**: Middleware calls `window.location.href = buildLoginUrl()`. User is redirected to OIDC login. `AuthGate` shows blank screen during redirect.
- **Guardrails**: `useAuth` marks `is401 = true` and sets `effectiveError = null` to prevent error screen flash.
- **Evidence**: IoTSupport `scripts/generate-api.js:62-66` (middleware); `src/hooks/use-auth.ts:83-93`.

- **Failure**: GET /api/auth/self returns 502/503/504 (server unreachable)
- **Surface**: `AuthGate` error screen
- **Handling**: Status-specific error title and description. "Server Unavailable" / "Service Unavailable" / "Server Timeout" with retry button.
- **Guardrails**: Retry button calls `refetch()`. No automatic retry (`retry: false`).
- **Evidence**: IoTSupport `src/components/auth/auth-gate.tsx:34-82`.

- **Failure**: GET /api/auth/self returns other 5xx
- **Surface**: `AuthGate` error screen
- **Handling**: Generic "Server Error" message with retry.
- **Guardrails**: Same as above.
- **Evidence**: IoTSupport `src/components/auth/auth-gate.tsx:69-75`.

- **Failure**: Network error (no status code)
- **Surface**: `AuthGate` error screen
- **Handling**: "Connection Error" message: "Unable to connect to the server. Please check your network connection."
- **Guardrails**: Retry button available.
- **Evidence**: IoTSupport `src/components/auth/auth-gate.tsx:38-42`.

- **Failure**: User name is null or empty
- **Surface**: `UserDropdown` trigger
- **Handling**: Displays "Unknown User" via `getDisplayName()` fallback.
- **Guardrails**: Handles null, empty string, and whitespace-only values.
- **Evidence**: IoTSupport `src/components/layout/user-dropdown.tsx:13-18`.

- **Failure**: Dropdown open when user clicks elsewhere
- **Surface**: `UserDropdown`
- **Handling**: `mousedown` listener on `document` closes dropdown when click target is outside ref. `keydown` listener closes on Escape.
- **Guardrails**: Listeners are attached only when `isOpen=true` and cleaned up on close/unmount.
- **Evidence**: IoTSupport `src/components/layout/user-dropdown.tsx:32-57`.

---

## 9) Observability / Instrumentation

- **Signal**: `ui_state:auth:loading`
- **Type**: Instrumentation event (`UiStateTestEvent`)
- **Trigger**: Emitted in `AuthProvider` useEffect when `isLoading` is true.
- **Labels / fields**: `{ kind: 'ui_state', scope: 'auth', phase: 'loading' }`
- **Consumer**: Playwright tests can wait for this event to confirm auth check is in progress.
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:62-67`.

- **Signal**: `ui_state:auth:ready`
- **Type**: Instrumentation event (`UiStateTestEvent`)
- **Trigger**: Emitted in `AuthProvider` useEffect when `isAuthenticated && user`.
- **Labels / fields**: `{ kind: 'ui_state', scope: 'auth', phase: 'ready', metadata: { userId: user.subject } }`
- **Consumer**: Playwright tests can wait for this event to confirm auth completed successfully.
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:69-75`.

- **Signal**: `ui_state:auth:error`
- **Type**: Instrumentation event (`UiStateTestEvent`)
- **Trigger**: Emitted in `AuthProvider` useEffect when `error` is truthy (non-401).
- **Labels / fields**: `{ kind: 'ui_state', scope: 'auth', phase: 'error', metadata: { message: error.message } }`
- **Consumer**: Playwright tests can wait for this event to confirm auth error state.
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:77-84`.

- **Signal**: `data-testid` attributes on auth components
- **Type**: Test selectors
- **Trigger**: Rendered with components.
- **Labels / fields**: `auth.gate.loading`, `auth.gate.error`, `auth.gate.error.retry`, `app-shell.topbar`, `app-shell.topbar.hamburger`, `app-shell.topbar.home-link`, `app-shell.topbar.logo`, `app-shell.topbar.title`, `app-shell.topbar.user`, `app-shell.topbar.user.name`, `app-shell.topbar.user.dropdown`, `app-shell.topbar.user.logout`
- **Consumer**: `AuthPage` page object locators.
- **Evidence**: IoTSupport `src/components/auth/auth-gate.tsx`, `src/components/layout/top-bar.tsx`, `src/components/layout/user-dropdown.tsx`.

---

## 10) Lifecycle & Background Work

- **Hook / effect**: Auth instrumentation effect in `AuthProvider`
- **Trigger cadence**: On changes to `[isLoading, isAuthenticated, user, error]`.
- **Responsibilities**: Emits `UiStateTestEvent` for auth state transitions.
- **Cleanup**: None needed; `emitTestEvent` is fire-and-forget.
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:59-86`.

- **Hook / effect**: Outside-click listener in `UserDropdown`
- **Trigger cadence**: Attached when `isOpen=true`, removed when `isOpen=false` or unmount.
- **Responsibilities**: Detects clicks outside dropdown ref and closes the menu.
- **Cleanup**: Returns cleanup function that removes `mousedown` listener.
- **Evidence**: IoTSupport `src/components/layout/user-dropdown.tsx:32-43`.

- **Hook / effect**: Escape-key listener in `UserDropdown`
- **Trigger cadence**: Attached when `isOpen=true`, removed when `isOpen=false` or unmount.
- **Responsibilities**: Detects Escape key press and closes the dropdown.
- **Cleanup**: Returns cleanup function that removes `keydown` listener.
- **Evidence**: IoTSupport `src/components/layout/user-dropdown.tsx:46-57`.

- **Hook / effect**: `useGetAuthSelf` query
- **Trigger cadence**: Once on mount. No automatic refetch (`staleTime: Infinity`, `refetchOnWindowFocus: false`). Manual refetch via `refetch()`.
- **Responsibilities**: Fetches user info from `/api/auth/self`.
- **Cleanup**: React Query handles cancellation on unmount.
- **Evidence**: IoTSupport `src/hooks/use-auth.ts:71-78`.

---

## 11) Security & Permissions

- **Concern**: Authentication enforcement via 401 interception
- **Touchpoints**: `openapi-fetch` middleware in `client.ts` (sole authority); `AuthGate` prevents rendering app content until authenticated.
- **Mitigation**: Middleware intercepts every API response. Even if `AuthGate` is somehow bypassed, individual API calls would still redirect on 401.
- **Residual risk**: If a component makes API calls outside the generated client (e.g., raw `fetch`), the middleware would not intercept those. This is acceptable because the project conventions mandate using generated hooks (per `CLAUDE.md` guideline 2).
- **Evidence**: IoTSupport `scripts/generate-api.js:61-68` (middleware); `CLAUDE.md` guideline 2.

- **Concern**: Session cookie security
- **Touchpoints**: Backend sets cookies; frontend does not manipulate them directly.
- **Mitigation**: Cookie attributes (HttpOnly, Secure, SameSite) are set by the backend. Frontend only navigates to `/api/auth/login` and `/api/auth/logout` endpoints.
- **Residual risk**: Cookie configuration is entirely backend-controlled and out of scope for this plan.
- **Evidence**: IoTSupport `src/lib/auth-redirect.ts` (only builds URL); `src/contexts/auth-context.tsx:47-49` (only navigates to logout URL).

- **Concern**: Logout token/session cleanup
- **Touchpoints**: `performLogout()` navigates to `/api/auth/logout`.
- **Mitigation**: Backend handles session invalidation. Full-page navigation ensures no stale state remains in the SPA.
- **Residual risk**: React Query cache may retain user data until the page fully reloads. Since logout navigates away, this is a non-issue.
- **Evidence**: IoTSupport `src/contexts/auth-context.tsx:47-49`.

---

## 12) UX / UI Impact

- **Entry point**: All routes (root layout)
- **Change**: Auth gate inserted before app content. Users see a blank screen during auth check (typically < 200ms), then the full app. On auth failure, an error screen with retry replaces the blank screen.
- **User interaction**: Transparent for authenticated users. Unauthenticated users are redirected to OIDC login automatically.
- **Dependencies**: Backend OIDC endpoints functional; session cookie set correctly.
- **Evidence**: IoTSupport `src/routes/__root.tsx:28-39`; `src/components/auth/auth-gate.tsx:140-161`.

- **Entry point**: App shell header area
- **Change**: New TopBar replaces the sidebar header. Layout changes from "sidebar with header | content" to "deployment bar | top bar | sidebar + content".
- **User interaction**: Hamburger button in top bar toggles sidebar (desktop) or mobile menu. Logo+title in top bar links to home. User dropdown in top bar shows name and logout option.
- **Dependencies**: `UserDropdown` depends on `AuthContext` for user info and logout function.
- **Evidence**: IoTSupport `src/components/layout/top-bar.tsx`; current `src/routes/__root.tsx:64-127`.

- **Entry point**: Sidebar
- **Change**: Header section (logo, title, collapse toggle) removed. Sidebar becomes navigation-only. On desktop, collapsed state shows icons only (w-20) instead of hiding completely.
- **User interaction**: Navigation behavior unchanged. Collapse/expand now triggered from TopBar hamburger.
- **Dependencies**: `isCollapsed` prop still needed for icon-only mode. `onToggle` prop removed.
- **Evidence**: Current `src/components/layout/sidebar.tsx:44-64` (section to remove).

---

## 13) Deterministic Test Plan

### Auth Loading and Ready States

- **Surface**: Auth gate, top bar
- **Scenarios**:
  - Given a valid session exists, When user navigates to `/`, Then the top bar appears with the user's name.
  - Given a valid session exists with a null name, When user navigates to `/`, Then the top bar shows "Unknown User".
- **Instrumentation / hooks**: Wait on `[data-testid="app-shell.topbar"]` visibility (indicates auth completed); `[data-testid="app-shell.topbar.user.name"]` for name text.
- **Gaps**: Loading screen flash is too brief to reliably assert in most cases (acknowledged in IoTSupport tests); the test verifies the final authenticated state.
- **Evidence**: IoTSupport `tests/e2e/auth/auth.spec.ts:17-35,124-152`.

### Auth Error and Retry

- **Surface**: Auth gate error screen
- **Scenarios**:
  - Given `auth.forceError(500)` is called, When user navigates to `/`, Then the error screen appears with retry button.
  - Given `auth.forceError(500)` is called and a session exists, When user clicks retry, Then the app loads successfully with the user's name displayed.
- **Instrumentation / hooks**: Wait on `[data-testid="auth.gate.error"]` visibility; `[data-testid="auth.gate.error.retry"]` click; `[data-testid="app-shell.topbar.user.name"]` text assertion.
- **Gaps**: None for this scenario.
- **Evidence**: IoTSupport `tests/e2e/auth/auth.spec.ts:83-121`.

### Login Redirect (Skipped)

- **Surface**: Auth middleware redirect
- **Scenarios**:
  - Given no session exists and OIDC is enabled, When user navigates to `/`, Then browser redirects to `/api/auth/login?redirect=...`.
- **Instrumentation / hooks**: `page.waitForRequest` on `/api/auth/login`.
- **Gaps**: These tests are skipped because the test backend auto-authenticates when OIDC is disabled. They are included as documentation for future OIDC-enabled test environments.
- **Evidence**: IoTSupport `tests/e2e/auth/auth.spec.ts:37-81`.

### Logout Flow

- **Surface**: User dropdown, logout endpoint
- **Scenarios**:
  - Given user is authenticated, When user clicks name then "Logout", Then browser navigates to `/api/auth/logout`.
  - Given user is authenticated, When user clicks name, Then dropdown appears with logout option visible.
- **Instrumentation / hooks**: `[data-testid="app-shell.topbar.user"]` click; `[data-testid="app-shell.topbar.user.dropdown"]` visibility; `[data-testid="app-shell.topbar.user.logout"]` click; `page.waitForRequest` on `/api/auth/logout`.
- **Gaps**: Does not verify post-logout page (backend-controlled).
- **Evidence**: IoTSupport `tests/e2e/auth/auth.spec.ts:154-196`.

### Top Bar Layout

- **Surface**: Top bar component
- **Scenarios**:
  - Given user is authenticated, When page loads, Then hamburger, logo, title ("Electronics"), and user dropdown are visible in left-to-right order.
  - Given user is on a non-home page, When user clicks the home link (logo+title), Then browser navigates to the home route.
- **Instrumentation / hooks**: `[data-testid="app-shell.topbar.hamburger"]`, `[data-testid="app-shell.topbar.logo"]`, `[data-testid="app-shell.topbar.title"]`, `[data-testid="app-shell.topbar.user"]` -- bounding box position assertions.
- **Gaps**: None.
- **Evidence**: IoTSupport `tests/e2e/auth/auth.spec.ts:283-329`.

### Sidebar Toggle (Desktop) and Mobile Menu

- **Surface**: App shell layout
- **Scenarios**:
  - Given desktop viewport (1280x720), When user clicks hamburger, Then sidebar collapses (data-state="collapsed"). Click again to expand.
  - Given mobile viewport (375x667), When user clicks hamburger, Then mobile overlay appears. Clicking backdrop dismisses it.
- **Instrumentation / hooks**: `[data-testid="app-shell.sidebar"]` data-state attribute; `[data-testid="app-shell.mobile-overlay"]` visibility; `[data-testid="app-shell.mobile-overlay.dismiss"]` click.
- **Gaps**: The `AppShellPage` page object must be updated in Slice 4 before verifying existing tests, since the sidebar toggle and mobile toggle selectors will no longer match the DOM after the TopBar restructuring.
- **Evidence**: IoTSupport `tests/e2e/auth/auth.spec.ts:199-281`; `tests/support/page-objects/app-shell-page.ts:9-27` (affected locators).

### Existing Tests Unaffected

- **Surface**: All existing test suites
- **Scenarios**:
  - Given OIDC is disabled in the test backend, When existing tests run without auth sessions, Then all tests pass without modification.
- **Instrumentation / hooks**: No new instrumentation needed. Existing fixtures remain unchanged except for `AppShellPage` locator updates (which preserve behavior with the new DOM structure).
- **Gaps**: If a future change enables OIDC in the test backend, existing factories would need `auth.createSession()` calls. This is explicitly out of scope. The `AppShellPage` update is a prerequisite for this scenario to hold.
- **Evidence**: Change brief: "Do NOT modify existing test fixtures to require auth sessions (OIDC is disabled in the test backend, so existing tests continue to work)".

---

## 14) Implementation Slices

### Slice 1: Generator + API Error + Auth Redirect

- **Goal**: Update the code generation pipeline and foundational utilities.
- **Touches**: `scripts/generate-api.js`, `src/lib/api/api-error.ts` (update `toApiError` + add `isUnauthorizedError`), `src/lib/auth-redirect.ts` (new), `src/lib/api/generated/client.ts` (regenerated), `src/lib/api/generated/hooks.ts` (regenerated), `src/lib/api/generated/types.ts` (regenerated).
- **Dependencies**: None. Must complete before slice 2 (hooks depend on updated `toApiError` signature and `isUnauthorizedError` predicate).

### Slice 2: Auth Hook + Context + Gate

- **Goal**: Add authentication state management and gating to the component tree.
- **Touches**: `src/hooks/use-auth.ts` (new), `src/contexts/auth-context.tsx` (new), `src/components/auth/auth-gate.tsx` (new).
- **Dependencies**: Slice 1 must complete (auth-redirect, toApiError with status, useGetAuthSelf with status pass-through).

### Slice 3: Layout Components + Root Route

- **Goal**: Restructure the app shell with TopBar, modified sidebar, and updated provider stack.
- **Touches**: `src/components/layout/top-bar.tsx` (new), `src/components/layout/user-dropdown.tsx` (new), `src/components/layout/sidebar.tsx` (modify), `src/routes/__root.tsx` (modify).
- **Dependencies**: Slice 2 must complete (TopBar uses UserDropdown which depends on AuthContext; root route wraps with AuthProvider/AuthGate).

### Slice 4: Test Infrastructure + Auth Specs

- **Goal**: Add test factory, fixtures, page object, and auth-specific test suite. Update `AppShellPage` to reflect the new TopBar-based layout. Verify existing tests still pass.
- **Touches**: `tests/api/factories/auth.ts` (new, page-scoped factory using `page.request`), `tests/support/fixtures.ts` (modify -- add standalone `auth` fixture, add auth-scoped console error suppression), `tests/support/page-objects/app-shell-page.ts` (modify -- replace sidebar/mobile toggle locators with TopBar hamburger), `tests/e2e/auth/AuthPage.ts` (new), `tests/e2e/auth/auth.spec.ts` (new).
- **Dependencies**: Slice 3 must complete (tests exercise the full auth + layout integration). Existing tests should be run to confirm no regressions. The `AppShellPage` update should be done first within this slice to unblock existing spec verification.

---

## 15) Risks & Open Questions

### Risks

- **Risk**: The `ulid` package used in IoTSupport's `AuthFactory` may not be installed in ElectronicsInventory.
- **Impact**: `AuthFactory.createSession()` would fail to generate unique subject IDs.
- **Mitigation**: Confirmed: `ulid` is already present in `package.json`. No action needed.

- **Risk**: The client middleware redirect fires on ALL 401 responses, including non-auth endpoints that might legitimately return 401 for other reasons.
- **Impact**: Unexpected redirects to login page during normal operation.
- **Mitigation**: The backend should only return 401 from the auth middleware, not from application logic. This matches the IoTSupport behavior and is controlled by the backend, not the frontend.

- **Risk**: Sidebar collapse behavior changes from the current icon-only (w-20) to the IoTSupport's full-hide (w-0). This is a UX regression if users expect icon-only mode.
- **Impact**: Users lose quick-access to navigation icons when sidebar is collapsed.
- **Mitigation**: Keep the ElectronicsInventory collapse behavior (w-20 with icons) rather than adopting IoTSupport's w-0 collapse. The sidebar only loses its header, not its collapse style.

- **Risk**: Console error suppression for 401/403/500 in the page fixture could mask real test failures.
- **Impact**: Genuine error conditions in non-auth tests might be silently ignored.
- **Mitigation**: Scope suppression to auth-related messages (e.g., matching `/api/auth/` in the error text) rather than blanket status code suppression. Auth-specific tests should use `__registerExpectedError` for any additional expected errors beyond the narrow global pattern.

- **Risk**: The `AppShellPage` page object references selectors (`app-shell.sidebar.toggle`, `app-shell.mobile-toggle`, `app-shell.mobile-toggle.button`) that will be removed during the layout restructuring.
- **Impact**: Existing app-shell tests using these locators will break after Slice 3, violating the "existing tests still pass" requirement.
- **Mitigation**: Include `AppShellPage` updates in Slice 4 (before running existing test verification). Replace the removed locators with TopBar-based equivalents and update the helper methods accordingly.

### Open Questions

None. All design decisions have been made explicitly in the change brief and are resolvable from the source codebase.

---

## 16) Confidence

Confidence: High -- The implementation is a direct port from a working codebase with clear file-level correspondence, all design decisions pre-made, and the generated hook (`useGetAuthSelf`) already present in the target codebase.
