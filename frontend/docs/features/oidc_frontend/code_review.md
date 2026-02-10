# OIDC Frontend Integration -- Code Review

## 1) Summary & Decision

**Readiness**

The OIDC frontend integration is a well-structured port from the IoTSupport codebase. The core auth flow (middleware, hook, context, gate) follows the plan faithfully, the provider stack ordering is correct, and the layout restructuring (TopBar, sidebar header removal, AppShellPage updates) is cleanly implemented. The generated API client and hooks have been regenerated with the new `result` pattern and status pass-through. Test infrastructure includes a page-scoped `AuthFactory`, page object, and comprehensive auth specs. One blocking issue exists: the `AuthError` component emits a `console.error` that the fixture suppression does not cover, which would cause the auth error/retry tests to fail.

**Decision**

`GO-WITH-CONDITIONS` -- One console error suppression gap must be closed before the auth error tests can pass. The remaining findings are minor and can be addressed without re-review.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `Plan section 1a: Code generator updated` <-> `scripts/generate-api.js:50-75` -- Generator now emits auth middleware in `generateClient()` and passes `result.response.status` to `toApiError()` in both `generateQueryHook()` (line 182-183) and `generateMutationHook()` (line 258-259). Dot handling added to `transformOperationId()` (line 316). Query params wired for mutations (lines 217-232).
- `Plan section 1a: API regenerated` <-> `src/lib/api/generated/client.ts:1-26`, `hooks.ts` fully regenerated -- Client has auth middleware; all hooks use `const result = await api...` pattern.
- `Plan section 1a: api-error.ts updated` <-> `src/lib/api/api-error.ts:44-73` -- `toApiError(error, status?)` and `isUnauthorizedError()` both implemented.
- `Plan section 1a: auth-redirect.ts created` <-> `src/lib/auth-redirect.ts:1-15` -- `buildLoginUrl()` with `pathname + search` encoding.
- `Plan section 1a: use-auth.ts created` <-> `src/hooks/use-auth.ts:1-88` -- Wraps `useGetAuthSelf`, exposes `UserInfo`, 401 detection via `isUnauthorizedError`, `effectiveError` filtering.
- `Plan section 1a: auth-context.tsx created` <-> `src/contexts/auth-context.tsx:1-106` -- `AuthProvider` with instrumentation, no 401 redirect (per plan requirement).
- `Plan section 1a: auth-gate.tsx created` <-> `src/components/auth/auth-gate.tsx:1-161` -- Loading/error/authenticated states with status-specific messaging.
- `Plan section 1a: top-bar.tsx created` <-> `src/components/layout/top-bar.tsx:1-76` -- Hamburger, logo+title link, spacer, UserDropdown.
- `Plan section 1a: user-dropdown.tsx created` <-> `src/components/layout/user-dropdown.tsx:1-128` -- Outside-click, Escape, logout flow.
- `Plan section 1a: sidebar.tsx modified` <-> `src/components/layout/sidebar.tsx` -- Header removed, `onToggle` prop removed, navigation preserved.
- `Plan section 1a: __root.tsx restructured` <-> `src/routes/__root.tsx:50-66` -- Provider stack is `QueryClientProvider > ToastProvider > AuthProvider > AuthGate > SseContextProvider > DeploymentProvider > QuerySetup > AppShellFrame`, matching plan.
- `Plan section 1a: DeploymentNotificationBar above TopBar` <-> `src/routes/__root.tsx:107-110` -- Deployment bar rendered first, then TopBar.
- `Plan section 1a: AuthFactory created` <-> `tests/api/factories/auth.ts:1-74` -- `createSession`, `clearSession`, `forceError` using `page.request`.
- `Plan section 1a: fixtures.ts updated` <-> `tests/support/fixtures.ts:94-97,222-228,390-398` -- `auth` fixture added as standalone page-scoped fixture; auth-scoped console suppression added.
- `Plan section 1a: AuthPage.ts created` <-> `tests/e2e/auth/AuthPage.ts:1-188` -- Full page object with locators, actions, and wait helpers.
- `Plan section 1a: auth.spec.ts created` <-> `tests/e2e/auth/auth.spec.ts:1-332` -- Auth loading, error/retry, user display, logout, sidebar toggle, mobile menu, top bar layout.
- `Plan section 1a: AppShellPage updated` <-> `tests/support/page-objects/app-shell-page.ts` -- Old selectors (`desktopToggle`, `mobileToggleContainer`, `mobileToggleButton`) replaced with `topBar` and `hamburgerButton`.

**Gaps / deviations**

- `Plan section 1a: "Existing tests still pass"` -- The `console.error` emitted by `AuthError` (line 92 of `auth-gate.tsx`) is not suppressed by the fixture's `/api/auth/` pattern and no `expectConsoleError` or `__registerExpectedError` call exists in the auth error tests. This will cause test failures. See Blocker finding below.
- `Plan: openapi.json changes` -- The regenerated OpenAPI spec moved health endpoints from `/api/health/*` to `/health/*` and metrics from `/api/metrics` to `/metrics`. These are backend-driven schema changes, not frontend errors, but they cause the generated hooks to reference non-`/api/` prefixed paths (`/health/drain`, `/health/healthz`, `/health/readyz`, `/metrics`). These hooks are not currently consumed by any frontend component, so the impact is nil at present -- but they may not work if ever used.
- `Plan section 9: Instrumentation events` -- The `auth-context.tsx` instrumentation effect (lines 63-89) properly emits `ui_state:auth:loading`, `ui_state:auth:ready`, and `ui_state:auth:error` events. However, the auth specs do not explicitly `waitForUiState` on these events -- instead they use locator-based waits (`waitForAuthenticated`, `waitForErrorScreen`). The plan mentions these events as available for Playwright consumption, so while this is consistent with the spec approach (locator-first), it is a deviation from the instrumentation-driven wait pattern recommended in `docs/contribute/testing/playwright_developer_guide.md`.

---

## 3) Correctness -- Findings (ranked)

- Title: **Blocker -- `console.error` in AuthError component will fail auth error tests**
- Evidence: `src/components/auth/auth-gate.tsx:92` -- `console.error('[AuthGate] Auth check failed:', error);`
  - The page fixture in `tests/support/fixtures.ts:227-229` suppresses console errors containing `/api/auth/`, but this `console.error` message starts with `[AuthGate]` and contains the error object -- it does NOT contain the string `/api/auth/`.
  - The auth tests at `tests/e2e/auth/auth.spec.ts:85-122` trigger 500 errors via `auth.forceError(500)` and do not call `expectConsoleError` or `__registerExpectedError`.
- Impact: Both auth error tests (`shows error screen when auth returns 500` and `retry button triggers new auth check`) will fail with `Console error: [AuthGate] Auth check failed: ...` thrown by the page fixture.
- Fix: Either (a) add `[AuthGate]` to the console error suppression pattern in `fixtures.ts`, or (b) remove the `console.error` call from `AuthError` (the error is already visible in the UI), or (c) use `expectConsoleError` in the auth error test specs. Option (b) is cleanest -- the error screen itself provides the user-facing feedback, and the `console.error` adds noise. If the log is desired for debugging, option (a) is the minimal fix: change the `/api/auth/` suppression to also match `[AuthGate]`.
- Confidence: High

---

- Title: **Minor -- Redundant dot replacement in `transformOperationId`**
- Evidence: `scripts/generate-api.js:316-319`:
  ```js
  // Replace hyphens and dots with underscores
  baseName = baseName.replace(/[-\.]/g, '_');

  // Replace periods (e.g., from .json extension) with underscores
  baseName = baseName.replace(/\./g, '_');
  ```
  The first regex already replaces dots, making the second `replace` a no-op.
- Impact: No functional impact. Minor readability/maintenance issue.
- Fix: Remove the second `baseName.replace(/\./g, '_')` call and its comment.
- Confidence: High

---

- Title: **Minor -- `isUnauthorizedError` fallback branch allows false positives**
- Evidence: `src/lib/api/api-error.ts:68-71`:
  ```ts
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: unknown }).status === 401;
  }
  ```
  This secondary branch matches any object with `status === 401`, not just `ApiError` instances. If a non-ApiError object with `status: 401` were passed, it would be treated as an auth failure.
- Impact: Low risk. In practice, all errors through the generated hooks go through `toApiError`, which either returns an `ApiError` or attaches `status` to an existing `Error`. The branch provides defense-in-depth for edge cases.
- Fix: Could restrict to `error instanceof Error` in the fallback branch, but current behavior is acceptable.
- Confidence: Medium

---

- Title: **Minor -- `toApiError` mutates existing Error instances by attaching `status`**
- Evidence: `src/lib/api/api-error.ts:47-49`:
  ```ts
  if (status !== undefined) {
    (error as Error & { status?: number }).status = status;
  }
  ```
  When an existing `Error` (not `ApiError`) is passed with a status, the function mutates it by adding a `status` property. This works but is a side-effect that could surprise callers.
- Impact: Low. The function is only called from generated hook code with freshly thrown errors. No shared error instances are reused.
- Fix: Acceptable as-is. Could wrap in a new `ApiError` instead, but that changes the error type chain.
- Confidence: Medium

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: Duplicate JSDoc blocks on Sidebar component
- Evidence: `src/components/layout/sidebar.tsx:1-5` (file-level comment) and `src/components/layout/sidebar.tsx:33-39` (function-level comment) both describe the same component with overlapping content.
- Suggested refactor: Keep only the function-level JSDoc block since that is where the actual export is.
- Payoff: Reduced duplication; cleaner file header.

---

- Hotspot: `AuthPage` page object duplicates locators available in `AppShellPage`
- Evidence: `tests/e2e/auth/AuthPage.ts:87-100` defines `sidebar`, `mobileOverlay`, `mobileOverlayDismiss` locators that already exist in `tests/support/page-objects/app-shell-page.ts:26-27,82-92`.
- Suggested refactor: The overlap is acceptable for now since `AuthPage` is auth-feature-scoped and uses a different base (raw `Page` constructor vs `BasePage`). If the duplication grows, consider composing `AuthPage` from `AppShellPage`. No action needed now.
- Payoff: Minor -- prevents drift if selectors change in one place but not the other.

---

## 5) Style & Consistency

- Pattern: Auth context uses `useEffect` for instrumentation; other contexts in the codebase use hook-based instrumentation patterns
- Evidence: `src/contexts/auth-context.tsx:63-89` uses a standalone `useEffect` with a manual `isTestMode()` check and direct `emitTestEvent` calls.
- Impact: Consistent with the plan's port-from-IoTSupport approach. Other contexts (toast, SSE) use different patterns because their instrumentation needs differ. No action needed.
- Recommendation: Acceptable pattern. The `isTestMode()` guard is correctly applied.

---

- Pattern: Mixed semicolon usage between files
- Evidence: `src/components/layout/top-bar.tsx` and `src/components/layout/user-dropdown.tsx` omit semicolons (matching the existing sidebar style), while `src/contexts/auth-context.tsx` and `src/hooks/use-auth.ts` use semicolons.
- Impact: Minimal. Both styles exist in the codebase already.
- Recommendation: Follow whatever the project formatter enforces. Not a blocker.

---

- Pattern: Auth gate `console.error` is a render-time side effect
- Evidence: `src/components/auth/auth-gate.tsx:92` -- `console.error('[AuthGate] Auth check failed:', error)` is called inside the `AuthError` render function body, meaning it fires on every render/re-render of the error state.
- Impact: Pollutes console during tests and re-renders. If React Strict Mode is enabled, it fires twice.
- Recommendation: Move the log into a `useEffect` in `AuthError` to fire only once when the error state mounts, or remove it entirely.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Auth loading and ready states
- Scenarios:
  - Given a valid session, When user navigates to `/`, Then top bar appears with user name (`tests/e2e/auth/auth.spec.ts:17-34`)
- Hooks: `waitForAuthenticated()` on `data-testid="app-shell.topbar"` visibility
- Gaps: Loading state is acknowledged as too brief to assert reliably (consistent with IoTSupport). Acceptable.
- Evidence: `tests/e2e/auth/auth.spec.ts:17-34`

---

- Surface: Auth error and retry
- Scenarios:
  - Given `forceError(500)`, When user navigates to `/`, Then error screen with retry button appears (`tests/e2e/auth/auth.spec.ts:85-98`)
  - Given `forceError(500)` and session exists, When user clicks retry, Then app loads with user name (`tests/e2e/auth/auth.spec.ts:100-122`)
- Hooks: `waitForErrorScreen()` on `data-testid="auth.gate.error"`, `clickRetry()` on `data-testid="auth.gate.error.retry"`
- Gaps: **Blocked by console.error finding above.** Tests will fail until the suppression gap is fixed. Also, no test covers network-level errors (no status) or specific 502/503/504 status codes, though these are lower priority.
- Evidence: `tests/e2e/auth/auth.spec.ts:84-122`, `src/components/auth/auth-gate.tsx:92`

---

- Surface: Authenticated user display
- Scenarios:
  - Given session with name "John Doe", When page loads, Then "John Doe" shown in top bar (`tests/e2e/auth/auth.spec.ts:126-138`)
  - Given session with null name, When page loads, Then "Unknown User" shown (`tests/e2e/auth/auth.spec.ts:140-152`)
- Hooks: `data-testid="app-shell.topbar.user.name"` text assertion
- Gaps: None.
- Evidence: `tests/e2e/auth/auth.spec.ts:125-153`

---

- Surface: Logout flow
- Scenarios:
  - Given authenticated user, When user clicks name then opens dropdown, Then dropdown visible with logout option (`tests/e2e/auth/auth.spec.ts:156-171`)
  - Given authenticated user, When user clicks logout, Then browser navigates to `/api/auth/logout` (`tests/e2e/auth/auth.spec.ts:173-196`)
- Hooks: `data-testid="app-shell.topbar.user"` click, `data-testid="app-shell.topbar.user.dropdown"` visibility, `page.waitForRequest` on `/api/auth/logout`
- Gaps: None.
- Evidence: `tests/e2e/auth/auth.spec.ts:155-197`

---

- Surface: Sidebar toggle (desktop) and mobile menu
- Scenarios:
  - Given desktop viewport, When hamburger clicked, Then sidebar collapses (`tests/e2e/auth/auth.spec.ts:202-221`)
  - Given desktop viewport with collapsed sidebar, When hamburger clicked again, Then sidebar expands (`tests/e2e/auth/auth.spec.ts:223-239`)
  - Given mobile viewport, When hamburger clicked, Then overlay menu appears (`tests/e2e/auth/auth.spec.ts:243-261`)
  - Given mobile menu open, When backdrop clicked, Then overlay closes (`tests/e2e/auth/auth.spec.ts:263-281`)
- Hooks: `data-state` on sidebar, `data-mobile-menu-state` on root, mobile overlay locators
- Gaps: None.
- Evidence: `tests/e2e/auth/auth.spec.ts:200-281`

---

- Surface: Top bar layout
- Scenarios:
  - Given authenticated user, When page loads, Then hamburger, logo, title "Electronics", user dropdown visible in left-to-right order (`tests/e2e/auth/auth.spec.ts:285-314`)
  - Given user on non-home page, When home link clicked, Then navigates to `/parts` (`tests/e2e/auth/auth.spec.ts:316-330`)
- Hooks: `boundingBox()` position assertions for order; URL regex for navigation
- Gaps: None.
- Evidence: `tests/e2e/auth/auth.spec.ts:284-331`

---

- Surface: Existing shell tests updated
- Scenarios:
  - `tests/e2e/shell/mobile-menu.spec.ts:17` updated from `mobileToggleButton` to `hamburgerButton`
  - `tests/support/page-objects/app-shell-page.ts` updated with TopBar-based locators
- Hooks: `app-shell.topbar.hamburger` replaces `app-shell.mobile-toggle.button` and `app-shell.sidebar.toggle`
- Gaps: None. Both `navigation.spec.ts` and `mobile-menu.spec.ts` use `AppShellPage` methods that now correctly point to the hamburger button.
- Evidence: `tests/e2e/shell/mobile-menu.spec.ts:17`, `tests/support/page-objects/app-shell-page.ts:55-77`

---

## 7) Adversarial Sweep (must attempt >= 3 credible failures or justify none)

- Title: **Major -- Auth middleware fires on every 401, including non-auth endpoints**
- Evidence: `src/lib/api/generated/client.ts:8-14`:
  ```ts
  async onResponse({ response }) {
    if (response.status === 401) {
      window.location.href = buildLoginUrl();
    }
    return response;
  },
  ```
  This middleware intercepts ALL 401 responses from ALL endpoints, not just `/api/auth/self`.
- Impact: If any future API endpoint returns 401 for non-authentication reasons (e.g., a permission check), the user would be incorrectly redirected to the login page. The plan acknowledges this as an intentional design decision: "The backend should only return 401 from the auth middleware, not from application logic" (Plan section 15, Risk 2).
- Fix: No fix needed now -- this matches the IoTSupport pattern and the backend contract. If the backend ever returns 401 from non-auth endpoints, the middleware would need scoping (e.g., check `response.url` for `/api/auth/`).
- Confidence: Medium (backend contract, not a frontend bug)

---

- Title: **Minor -- Concurrent auth middleware redirect during React Query processing**
- Evidence: `src/lib/api/generated/client.ts:11` -- `window.location.href = buildLoginUrl()` fires synchronously in the middleware response handler. React Query will continue to process the error response even after the redirect is initiated.
- Impact: The plan explicitly addresses this: "The middleware redirect fires before React Query can process the error. This is intentional -- it prevents a brief flash of the error screen before redirect." The `useAuth` hook's `effectiveError` filter (line 78) also suppresses 401 errors, so even if the query error handler runs before the redirect completes, no error screen flashes.
- Fix: No action needed. The dual-layer defense (middleware redirect + effectiveError filtering) handles the race correctly.
- Confidence: High

---

- Title: **Minor -- `window.innerWidth` check is not reactive to resize**
- Evidence: `src/routes/__root.tsx:92-98`:
  ```ts
  const handleMenuToggle = () => {
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      toggleMobileMenu();
    } else {
      toggleSidebar();
    }
  };
  ```
  If a user resizes the browser from desktop to mobile width without clicking the hamburger, and then clicks it, the check uses the current (correct) width at click time. However, if the sidebar is collapsed on desktop and then the viewport is resized to mobile width, the collapsed sidebar state persists incorrectly.
- Impact: Low. The plan acknowledges this: "`window.innerWidth` check is a point-in-time measurement, not reactive. This matches the IoTSupport pattern and is acceptable." The CSS `hidden lg:block` classes handle showing/hiding the desktop sidebar at the breakpoint regardless.
- Fix: Acceptable as-is. CSS responsive classes handle the visual side. The state inconsistency only manifests if the user actively resizes and then interacts -- an edge case.
- Confidence: High

---

## 8) Invariants Checklist (table)

- Invariant: `isAuthenticated` and `isUnauthenticated` must never both be `true`
  - Where enforced: `src/hooks/use-auth.ts:72-75` -- `isAuthenticated = user !== null` (requires data), `isUnauthenticated = !isLoading && is401` (requires 401 error). These are mutually exclusive because `data` and `error` do not coexist in React Query's success vs error states.
  - Failure mode: If React Query somehow returned both `data` and `error`, both could be true. This cannot happen with TanStack Query's state machine.
  - Protection: React Query guarantees `data` and `error` are mutually exclusive in a given state.
  - Evidence: `src/hooks/use-auth.ts:68-75`

---

- Invariant: `effectiveError` must be `null` when error is a 401
  - Where enforced: `src/hooks/use-auth.ts:78` -- `const effectiveError = error && !is401 ? (error as Error) : null`
  - Failure mode: If `isUnauthorizedError` returned false for a 401 error, the 401 would surface as a real error and the AuthGate would show the error screen instead of staying blank during redirect.
  - Protection: `toApiError` attaches `status` from `response.status` (reliable), and `isUnauthorizedError` checks both `ApiError.status` and raw `status` property.
  - Evidence: `src/lib/api/api-error.ts:44-73`, `src/hooks/use-auth.ts:68-78`

---

- Invariant: `mobileMenuOpen` must reset to `false` on navigation
  - Where enforced: `src/routes/__root.tsx:85-87` -- `handleNavigation` sets `setMobileMenuOpen(false)`, called from `Sidebar`'s `onNavigate` prop.
  - Failure mode: If a navigation occurs outside the sidebar links (e.g., `TopBar` home link), the mobile menu would not close. However, the TopBar home link triggers a full route navigation, and the mobile menu is only visible on mobile -- where the TopBar link navigates but does not interact with `mobileMenuOpen` state.
  - Protection: The TopBar home link is a `<Link>` component. On mobile, if the user opens the mobile menu and clicks a sidebar nav link, `handleNavigation` fires. If they click the TopBar home link instead, the mobile overlay remains open because `onNavigate` is only wired to `Sidebar`.
  - Evidence: `src/routes/__root.tsx:85-87`, `src/components/layout/top-bar.tsx:49-67`

---

- Invariant: Auth instrumentation events fire only in test mode
  - Where enforced: `src/contexts/auth-context.tsx:64` -- `if (!isTestMode()) return;` guards the entire effect body.
  - Failure mode: If `isTestMode()` returned `true` in production, events would fire. This is protected by the `VITE_TEST_MODE` env variable only being set in test builds.
  - Protection: `isTestMode()` checks `import.meta.env.VITE_TEST_MODE`.
  - Evidence: `src/contexts/auth-context.tsx:63-89`, `src/lib/config/test-mode.ts`

---

## 9) Questions / Needs-Info

- Question: Does the backend's `/api/testing/auth/force-error` endpoint return the forced error only once (single-shot), or does it persist until cleared?
- Why it matters: The `retry button triggers new auth check` test at `tests/e2e/auth/auth.spec.ts:100-122` calls `forceError(500)` then `createSession`, then expects the retry to succeed. If `forceError` is NOT single-shot, the retry would also get a 500 and the test would fail.
- Desired answer: Confirmation that `force-error` is single-shot (the plan states "The error is single-shot - subsequent requests resume normal behavior" in the AuthFactory JSDoc at line 63).

---

## 10) Risks & Mitigations (top 3)

- Risk: The `console.error` in `AuthError` will cause auth error tests to fail under the current console error policy.
- Mitigation: Either remove the `console.error` call, add `[AuthGate]` to the fixture suppression pattern, or use `expectConsoleError` in the auth error specs. Must be resolved before tests can pass.
- Evidence: `src/components/auth/auth-gate.tsx:92`, `tests/support/fixtures.ts:225-229`

---

- Risk: The OpenAPI spec change moved health/metrics endpoints from `/api/health/*` to `/health/*` (without `/api/` prefix). If the generated hooks for these endpoints are ever used by frontend components, they would fail because the Vite dev server proxy only forwards `/api/*` requests to the backend.
- Mitigation: These hooks are currently unused by any frontend component. The path change is backend-driven (reflected in `openapi-cache/openapi.json`). If they need to be used in the future, the OpenAPI spec should be corrected to include the `/api/` prefix, or the Vite proxy config should be extended.
- Evidence: `src/lib/api/generated/hooks.ts:2508,2524,2540,2556` -- paths are `/health/drain`, `/health/healthz`, `/health/readyz`, `/metrics`

---

- Risk: Mobile overlay does not close when navigating via TopBar home link while mobile menu is open.
- Mitigation: This is an edge case. The TopBar home link is always visible regardless of mobile menu state, and the link triggers a full client-side navigation. The mobile overlay simply stays open over the new content. This matches the IoTSupport behavior. If it becomes a UX issue, wire the TopBar `<Link>` `onClick` to also call `handleNavigation()` or add a route-change effect.
- Evidence: `src/components/layout/top-bar.tsx:49-67`, `src/routes/__root.tsx:85-87`

---

## 11) Confidence

Confidence: High -- The implementation closely follows a proven pattern from IoTSupport with well-documented adaptations. The single blocking finding (console error suppression) is straightforward to fix. All plan deliverables are present with appropriate test coverage.
