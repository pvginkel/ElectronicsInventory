# Plan Review: OIDC Frontend Integration

## 1) Summary & Decision

**Readiness**

The plan is thorough, well-researched, and implementation-ready. It provides detailed file-level evidence for every change, maps IoTSupport source code to ElectronicsInventory targets, and explicitly resolves the three key conflicts between the two codebases (dual 401 redirect, sidebar collapse behavior, provider ordering). The implementation slices are logically ordered with clear dependencies. The plan now covers all critical gaps identified in the initial review: `isUnauthorizedError()` is in the file map and Slice 1, the `AuthFactory` pattern divergence is explicitly documented with fixture wiring guidance, the `AppShellPage` page object is in the file map and Slice 4, and console error suppression is scoped to auth-related messages.

**Decision**
`GO` -- The plan is implementation-ready. All previously identified Major issues have been addressed with targeted additions to the file map, slice descriptions, and risk documentation. The remaining Minor observations do not block implementation.

---

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` -- Pass -- The plan follows all 16 required headings, includes the user requirements checklist verbatim (section 1a), provides evidence quotes with file:line references, and documents derived state invariants with >= 3 entries.
- `docs/product_brief.md` -- Pass with note -- `product_brief.md:9` states "No login required." The OIDC feature represents an evolution of the product from single-user to authenticated access. The change brief (`change_brief.md:1-6`) provides the authoritative justification for this change. The plan correctly treats authentication as an infrastructure addition that does not alter existing domain behavior.
- `docs/contribute/architecture/application_overview.md` -- Pass -- `plan.md:34` correctly identifies the provider stack from `application_overview.md:56-58` and proposes inserting AuthProvider/AuthGate into the existing hierarchy. The plan uses generated API hooks (`useGetAuthSelf`), custom hooks in `src/hooks/`, and contexts in `src/contexts/` -- all following documented patterns.
- `docs/contribute/testing/playwright_developer_guide.md` -- Pass -- `plan.md:186-204` creates factories, page objects, and specs following the documented structure. The plan respects the dirty-database policy, uses factory-based data setup, and employs `data-testid` selectors. The `AuthFactory` pattern divergence (using `page.request` instead of `createApiClient`) is now explicitly documented at `plan.md:187` with justification for why it must differ from other factories.
- `CLAUDE.md` -- Pass -- `plan.md:57-58` creates `auth-context.tsx` and `auth-gate.tsx` following the context/provider pattern in `src/contexts/`. The plan adds instrumentation behind `isTestMode()` (`plan.md:391`) and uses the documented test-event taxonomy (`UiStateTestEvent`).

**Fit with codebase**

- `tests/support/page-objects/app-shell-page.ts` -- `plan.md:202-204` -- Now included in the file map. The plan documents which locators will break (`desktopToggle`, `mobileToggleContainer`, `mobileToggleButton`) and specifies they must be replaced with TopBar hamburger locators. Aligned.
- `src/lib/api/api-error.ts` -- `plan.md:138-144` -- Now includes both `toApiError()` update and `isUnauthorizedError()` addition. The implementation specification (checking `error instanceof ApiError && error.status === 401`) is clear and aligns with the IoTSupport source. Aligned.
- `tests/api/index.ts` -- `plan.md:187` -- The plan now explicitly states that the barrel file does NOT need updating because `AuthFactory` is a standalone page-scoped fixture, not part of `testData`. Aligned.
- `tests/support/fixtures.ts` -- `plan.md:190-192` -- The fixture wiring is now clearly specified: `auth` is a standalone page-scoped fixture (like `deploymentSse`), not bundled into `testData`. Console error suppression is scoped to auth-related messages. Aligned.

---

## 3) Open Questions & Ambiguities

All previously identified open questions have been resolved in the updated plan:

- `isUnauthorizedError()` location and implementation: Resolved at `plan.md:142-144`.
- `AuthFactory` pattern divergence: Resolved at `plan.md:187-188`.
- `AppShellPage` selector updates: Resolved at `plan.md:202-204`.

No remaining open questions that would block implementation.

---

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Auth loading and authenticated state
- Scenarios:
  - Given a valid session exists, When user navigates to `/`, Then the top bar appears with the user's name (`tests/e2e/auth/auth.spec.ts`)
  - Given a valid session with null name, When user navigates to `/`, Then the top bar shows "Unknown User" (`tests/e2e/auth/auth.spec.ts`)
- Instrumentation: `[data-testid="app-shell.topbar"]`, `[data-testid="app-shell.topbar.user.name"]`, `ui_state:auth:ready` event
- Backend hooks: `AuthFactory.createSession()` via `page.request`
- Gaps: None
- Evidence: `plan.md:542-550`

- Behavior: Auth error and retry flow
- Scenarios:
  - Given `auth.forceError(500)`, When user navigates to `/`, Then error screen appears with retry button (`tests/e2e/auth/auth.spec.ts`)
  - Given `auth.forceError(500)` and a session exists, When user clicks retry, Then the app loads successfully (`tests/e2e/auth/auth.spec.ts`)
- Instrumentation: `[data-testid="auth.gate.error"]`, `[data-testid="auth.gate.error.retry"]`, `ui_state:auth:error` event
- Backend hooks: `AuthFactory.forceError(status)`, `AuthFactory.createSession()`
- Gaps: None
- Evidence: `plan.md:552-560`

- Behavior: Logout flow
- Scenarios:
  - Given user is authenticated, When user clicks name then "Logout", Then browser navigates to `/api/auth/logout` (`tests/e2e/auth/auth.spec.ts`)
- Instrumentation: `[data-testid="app-shell.topbar.user"]`, `[data-testid="app-shell.topbar.user.dropdown"]`, `[data-testid="app-shell.topbar.user.logout"]`
- Backend hooks: `AuthFactory.createSession()`
- Gaps: None
- Evidence: `plan.md:571-579`

- Behavior: TopBar layout and navigation
- Scenarios:
  - Given user is authenticated, When page loads, Then hamburger, logo, title, and user dropdown are visible in left-to-right order (`tests/e2e/auth/auth.spec.ts`)
  - Given user is on a non-home page, When user clicks home link, Then browser navigates to home route (`tests/e2e/auth/auth.spec.ts`)
- Instrumentation: `[data-testid="app-shell.topbar.hamburger"]`, `[data-testid="app-shell.topbar.logo"]`, `[data-testid="app-shell.topbar.title"]`, `[data-testid="app-shell.topbar.user"]`
- Backend hooks: `AuthFactory.createSession()`
- Gaps: None
- Evidence: `plan.md:581-589`

- Behavior: Sidebar toggle and mobile menu (restructured)
- Scenarios:
  - Given desktop viewport, When user clicks hamburger in TopBar, Then sidebar collapses (`tests/e2e/auth/auth.spec.ts`)
  - Given mobile viewport, When user clicks hamburger in TopBar, Then mobile overlay appears (`tests/e2e/auth/auth.spec.ts`)
- Instrumentation: `[data-testid="app-shell.sidebar"]` data-state, `[data-testid="app-shell.mobile-overlay"]`
- Backend hooks: `AuthFactory.createSession()`
- Gaps: None -- `AppShellPage` update is now included in Slice 4 (`plan.md:634-636`)
- Evidence: `plan.md:591-599`

---

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

The three Major issues from the initial review have been resolved. Performing a fresh adversarial sweep:

- Checks attempted: Missing file map entries for utilities referenced but not listed
- Evidence: `plan.md:142-144` now lists `isUnauthorizedError()`, `plan.md:202-204` now lists `AppShellPage`
- Why the plan holds: All referenced functions, files, and test infrastructure are now accounted for in the file map with clear evidence and slice assignments.

- Checks attempted: Stale cache risk from auth query key mismatch
- Evidence: `plan.md:388` documents query key as `['getAuthSelf']`; current `hooks.ts:605` shows key as `['getAuthSelf', params]`
- Why the plan holds: The `useAuth` hook passes no params to `useGetAuthSelf`, so the effective key will be `['getAuthSelf', undefined]`. This is the standard generated pattern and TanStack Query handles undefined params correctly. No stale cache risk.

- Checks attempted: React 19 concurrent mode interaction with auth middleware redirect
- Evidence: `plan.md:312` documents that the middleware redirect fires before React Query processes the error; `plan.md:390` confirms `retry: false` prevents automatic retries
- Why the plan holds: The `window.location.href` assignment in the middleware is synchronous and causes a full navigation, preempting any React rendering. Even with React 19's concurrent features, the page unload prevents a flash of the error screen. The `staleTime: Infinity` and `refetchOnWindowFocus: false` settings prevent any background refetch that could interfere.

- Checks attempted: Auth context effect dependency array completeness
- Evidence: `plan.md:391` lists effect dependencies as `[isLoading, isAuthenticated, user, error]`
- Why the plan holds: These four values represent the complete set of auth state transitions. The effect emits events for all three phases (loading, ready, error). No derived value is missing from the dependency array.

**Minor -- Out-of-scope declaration conflicts with AppShellPage modification**
**Evidence:** `plan.md:69` states "Changes to existing domain page objects or test specs" is out of scope, but `plan.md:202-204` and `plan.md:634-636` correctly include `AppShellPage` modifications.
**Why it matters:** An implementer reading the out-of-scope section first might skip the `AppShellPage` update. The contradiction is minor since the file map and slice details are authoritative, but the out-of-scope bullet could cause confusion.
**Fix suggestion:** Update the out-of-scope bullet to clarify: "Changes to existing domain page objects or test specs (except `AppShellPage` which requires locator updates due to layout restructuring)."
**Confidence:** Medium

---

## 6) Derived-Value & State Invariants (table)

- Derived value: `isUnauthenticated`
  - Source dataset: Computed from `isLoading` (query state) and `is401` (error status check via `isUnauthorizedError()`) in `useAuth()`
  - Write / cleanup triggered: Not acted upon in ElectronicsInventory (middleware handles redirects). `AuthGate` treats the state as "redirect in progress" and shows blank.
  - Guards: Only set true after loading completes and error is confirmed as 401 via `isUnauthorizedError()`
  - Invariant: Must never be `true` simultaneously with `isAuthenticated`.
  - Evidence: `plan.md:356-361`

- Derived value: `effectiveError`
  - Source dataset: Filtered from `error` by excluding 401 errors: `error && !is401 ? error : null`
  - Write / cleanup triggered: Surfaces as `error` in `AuthContextValue`, consumed by `AuthGate` to display error screen with retry
  - Guards: The 401 filter depends on `isUnauthorizedError()` (now documented in file map at `plan.md:142-144`), which checks `error.status === 401`. Requires `toApiError(error, status)` from Slice 1 to propagate the status code.
  - Invariant: Must be `null` when the error is a 401. Must be non-null for any other error status.
  - Evidence: `plan.md:363-368`

- Derived value: `displayName`
  - Source dataset: Unfiltered -- directly from `user?.name` in `AuthContextValue`
  - Write / cleanup triggered: Rendered as text in the UserDropdown trigger. No persistent write.
  - Guards: `getDisplayName()` falls back to "Unknown User" for null/empty/whitespace names
  - Invariant: Must always produce a non-empty string.
  - Evidence: `plan.md:370-375`

- Derived value: `sidebarCollapsed` / `mobileMenuOpen`
  - Source dataset: Local `useState` in `AppShellFrame`, toggled by `handleMenuToggle()` based on `window.innerWidth < 1024`
  - Write / cleanup triggered: Drives sidebar width class and mobile overlay visibility. `mobileMenuOpen` is reset to `false` on navigation.
  - Guards: Viewport width check at toggle time prevents cross-state pollution.
  - Invariant: `mobileMenuOpen` must be reset on any route navigation.
  - Evidence: `plan.md:377-382`, `__root.tsx:49-62`

No filtered-view-drives-persistent-write issues detected.

---

## 7) Risks & Mitigations (top 3)

- Risk: The out-of-scope section at `plan.md:69` states "Changes to existing domain page objects or test specs" is excluded, but the file map and slices correctly include `AppShellPage` modifications. This contradiction could confuse an implementer who reads the scope section first.
- Mitigation: Update the out-of-scope bullet to add an exception for `AppShellPage` layout-driven locator updates.
- Evidence: `plan.md:69`, `plan.md:202-204`, `plan.md:634-636`

- Risk: The client middleware redirect fires on ALL 401 responses, including non-auth endpoints that might legitimately return 401. This is an inherent design tradeoff of the single-handler approach.
- Mitigation: The backend controls which endpoints return 401. The plan correctly notes this is a backend responsibility at `plan.md:648-650`.
- Evidence: `plan.md:648-650`

- Risk: The `effectiveError` invariant depends on `isUnauthorizedError()` correctly detecting 401 status codes, which in turn depends on the `toApiError(error, status)` change propagating the HTTP status. If the generator update has a bug that omits the status parameter, 401 errors would show the error screen instead of blank-during-redirect.
- Mitigation: The generator change is well-documented with source evidence at `plan.md:112-114`. Slice 1 completion should include a manual verification that `toApiError(result.error, result.response.status)` appears in the regenerated hooks.
- Evidence: `plan.md:112-114`, `plan.md:363-368`

---

## 8) Confidence

Confidence: High -- The plan is comprehensive, well-evidenced, and addresses all previously identified gaps. The single remaining Minor issue (out-of-scope contradiction) is easily resolved and does not affect implementation correctness. The plan provides a clear path from generator updates through auth infrastructure to layout restructuring to test coverage, with each slice building on the previous one.
