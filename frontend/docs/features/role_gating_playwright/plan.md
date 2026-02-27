# Role Gating Playwright Tests + CLAUDE.md Documentation -- Technical Plan

## 0) Research Log & Findings

**Searched areas and key discoveries:**

- **Gate component** (`src/components/auth/gate.tsx`): Declarative role gate accepting `requires` (single or array of `RequiredRole`) and optional `fallback`. When the user lacks all required roles and no fallback is given, nothing renders. When a fallback is provided (e.g., a disabled button), it renders in place of the gated children.
- **usePermissions hook** (`src/hooks/use-permissions.ts`): Wraps `useAuthContext()` and exposes `hasRole(role)` for imperative checks. `Gate` uses this internally.
- **Generated roles** (`src/lib/api/generated/roles.ts`): All 67 mutation role constants resolve to `"editor"`. `RequiredRole` is currently the single literal type `"editor"`. Reader-level endpoints do not generate constants.
- **AuthFactory** (`tests/support/helpers/auth-factory.ts`): `createSession({ roles: ['reader'] })` sets a test session with controllable roles via `POST /api/testing/auth/session`. Existing e2e tests do not call `createSession` explicitly -- they rely on the test backend's auto-authentication, which grants full roles.
- **Gate usage in components**: Seven component files import and use `Gate`:
  - `box-list.tsx`: wraps the Add Box button (`boxes.list.add`) and the empty-state CTA (`boxes.list.empty.cta`) with `postBoxesRole`
  - `box-details.tsx`: wraps Edit (`boxes.detail.actions.edit`) and Delete (`boxes.detail.actions.delete`) buttons with their respective role constants
  - `part-details.tsx`: wraps the entire Edit/Delete/Menu action bar with `deletePartsByPartKeyRole`
  - `seller-link-section.tsx`: wraps the remove button (with a disabled fallback) with `deletePartsSellerLinksByPartKeyAndSellerLinkIdRole`, and the Add Seller Link button with `postPartsSellerLinksByPartKeyRole`
  - `kit-detail-header.tsx`: wraps Order Stock, Edit Kit, and the More Actions dropdown menu with their respective role constants
  - `kit-detail.tsx`: wraps the BOM "Add part" button with `postKitsContentsByKitIdRole`
  - `pick-list-detail.tsx`: wraps the Delete Pick List button with `deletePickListsByPickListIdRole`
- **Page objects**: Existing page objects for boxes, parts, kits, sellers, and pick-lists already expose locators for the gated controls (e.g., `BoxesPage.addButton`, `BoxesPage.detailEditButton`, `PartsPage.editPartButton`, `KitsPage.detailEditButton`). No new page objects are needed.
- **Existing auth specs** (`tests/infrastructure/auth/`): Cover auth loading, error/retry, user display, logout, and app shell layout. None test role-based visibility.
- **ESLint rule** (`eslint.config.js`): `role-gating/role-import-enforcement` is `"error"` in `src/**/*.{ts,tsx}` and enforces that mutation hook imports are paired with their role constant imports.
- **CLAUDE.md**: Currently has no "Role Gating" section. The change brief requests adding one.

**Conflicts resolved:**

- The new spec file path `tests/e2e/auth/role-gating.spec.ts` sits alongside the infrastructure auth specs at `tests/infrastructure/auth/`. I use `tests/e2e/auth/` per the change brief since this tests UI behavior (role-driven visibility), not infrastructure plumbing.

---

## 1) Intent & Scope

**User intent**

Add a Playwright spec that exercises the role-gating system end-to-end: a reader-role user should see read-only content but not editor-only controls, while an editor-role user should see everything. Additionally, document the Gate system in CLAUDE.md so future contributors understand the role-gating patterns.

**Prompt quotes**

- "Playwright spec that logs in as a reader-role user and verifies that editor-only controls (create, edit, delete buttons) are hidden or disabled, while read-only content (lists, detail views, navigation) remains accessible"
- "contrasting test with `roles: ['reader', 'editor']` to confirm the same controls ARE visible"
- "Uses existing page objects and test helpers -- no new page objects needed"
- "Add role gating section to CLAUDE.md explaining the Gate system, generated role constants, the ESLint rule, and how to use them"

**In scope**

- New Playwright spec at `tests/e2e/auth/role-gating.spec.ts`
- Reader-role tests covering representative Gate-wrapped controls across boxes, parts, kits, and pick-lists
- Editor-role contrasting test confirming those controls are visible
- `<Gate fallback={...}>` verification (seller-link-section disabled fallback for readers)
- "Role Gating" section added to CLAUDE.md
- Verification that existing specs remain green

**Out of scope**

- New page objects or test helpers
- Changes to the Gate component or usePermissions hook
- Changes to generated role constants
- Route-level access control (readers and editors see the same routes)
- Testing every Gate usage site (representative sampling suffices)

**Assumptions / constraints**

- The test backend's `POST /api/testing/auth/session` correctly sets the session's roles and the frontend reads them via `/api/auth/self`.
- The test backend auto-authenticates when no explicit session is set; existing tests (which do not call `auth.createSession`) will continue working with editor-level access by default.
- All Gate-wrapped controls use `"editor"` as the required role (per the generated constants).
- The `fallback` prop on Gate renders a visible-but-disabled element; non-fallback Gates render nothing at all for unauthorized users.

---

## 1a) User Requirements Checklist

**User Requirements Checklist**

- [ ] Playwright spec at `tests/e2e/auth/role-gating.spec.ts` tests reader-role visibility
- [ ] Reader-role tests verify editor-only controls are hidden (create, edit, delete buttons)
- [ ] Reader-role tests verify read-only content remains accessible (lists, details, navigation)
- [ ] Editor-role contrasting test confirms editor controls are visible
- [ ] Tests use existing page objects and AuthFactory -- no new page objects created
- [ ] `<Gate fallback={...}>` elements render their disabled fallback for readers
- [ ] CLAUDE.md has a "Role Gating" section documenting Gate, role constants, ESLint rule, and usage patterns
- [ ] All existing Playwright tests remain green
- [ ] `pnpm check` passes

---

## 2) Affected Areas & File Map

- Area: `tests/e2e/auth/role-gating.spec.ts` (new file)
- Why: The primary deliverable -- Playwright spec exercising reader-role and editor-role Gate behavior.
- Evidence: File does not exist yet. Change brief specifies this path.

- Area: `CLAUDE.md` (edit)
- Why: Add a "Role Gating" section documenting Gate, usePermissions, generated role constants, and the ESLint rule.
- Evidence: `CLAUDE.md` currently has no mention of Gate, roles, or usePermissions.

---

## 3) Data Model / Contracts

- Entity / contract: `POST /api/testing/auth/session` (test-only endpoint)
- Shape: `{ subject: string, name: string | null, email: string | null, roles: string[] }`
- Mapping: AuthFactory passes `roles` directly; the frontend reads the session via `/api/auth/self` which returns `{ roles: string[], subject, name, email }`.
- Evidence: `tests/support/helpers/auth-factory.ts:29-40` -- `createSession` sends `roles` in the POST body.

- Entity / contract: `UserInfo.roles` consumed by `usePermissions`
- Shape: `string[]` (e.g., `["reader"]` or `["reader", "editor"]`)
- Mapping: `use-auth.ts:37-43` transforms the API response directly. `usePermissions` calls `user.roles.includes(role)`.
- Evidence: `src/hooks/use-permissions.ts:29-31`

---

## 4) API / Integration Surface

- Surface: `POST /api/testing/auth/session`
- Inputs: `{ subject, name, email, roles }` via AuthFactory
- Outputs: Sets session cookie; subsequent `/api/auth/self` calls return the configured user
- Errors: Non-2xx status throws in AuthFactory
- Evidence: `tests/support/helpers/auth-factory.ts:29-47`

- Surface: `GET /api/auth/self`
- Inputs: Session cookie (set by the testing endpoint above)
- Outputs: `{ subject, name, email, roles }` consumed by `useAuth` hook
- Errors: 401 triggers redirect; other errors show AuthGate error screen
- Evidence: `src/hooks/use-auth.ts:55-88`

No new API surfaces are introduced. The spec relies on existing testing endpoints.

---

## 5) Algorithms & UI Flows

- Flow: Reader-role test session setup and page navigation
- Steps:
  1. Seed test data using `testData` factories (these use a Node-level API client that bypasses the browser session, so no role restrictions apply to seeding)
  2. Call `auth.createSession({ roles: ['reader'] })` to set a reader-only session in the browser context
  3. Navigate to `/boxes` and wait for `boxes.list` ready event
  4. Assert that the list renders (cards visible, summary visible) -- read-only content accessible
  5. Assert that `boxes.list.add` (Add Box button) is not visible -- Gate hides it
  6. Navigate to a box detail page and wait for `boxes.detail` ready event
  7. Assert detail content renders (summary, locations) -- read-only content accessible
  8. Assert `boxes.detail.actions.edit` and `boxes.detail.actions.delete` are not visible -- Gate hides them
  9. Repeat similar assertions for parts detail (edit/delete/menu hidden), kits detail (order-stock/edit/menu hidden), and pick-list detail (delete hidden, view-pdf visible)
- States / transitions: Page load -> waitForListLoading -> assertion. No mutations are performed.
- Hotspots: Slow list loads could cause timeout; mitigated by using existing `waitForListLoading` helpers.
- Evidence: `src/components/boxes/box-list.tsx:135-143` (Gate around add button); `src/components/boxes/box-details.tsx:248-263` (Gate around edit/delete); `src/components/pick-lists/pick-list-detail.tsx:326-335` (Gate around delete)

- Flow: Gate fallback rendering for reader
- Steps:
  1. In reader-role session, navigate to a part detail page with seller links
  2. Assert that the seller link remove buttons are visible but disabled (the Gate fallback renders a disabled button)
  3. Assert that the "Add Seller Link" button is not visible (that Gate has no fallback)
- States / transitions: Part detail loads, seller links section renders with fallback controls
- Evidence: `src/components/parts/seller-link-section.tsx:132-158` (Gate with fallback for remove), `src/components/parts/seller-link-section.tsx:173-179` (Gate without fallback for add)

- Flow: Editor-role contrasting test
- Steps:
  1. Seed test data using `testData` factories (same Node-level client as reader flow)
  2. Call `auth.createSession({ roles: ['reader', 'editor'] })` to set an editor session in the browser context
  3. Navigate to `/boxes` and wait for list ready
  4. Assert that `boxes.list.add` IS visible
  5. Navigate to box detail; assert edit and delete buttons ARE visible
  6. Check parts detail controls (edit/delete/menu), kits detail controls (order-stock/edit/menu/add-part), and pick-list detail controls (delete) are visible
- States / transitions: Same navigation flow, opposite assertions
- Evidence: Same components as above, asserting `toBeVisible()` instead of `not.toBeVisible()`

---

## 6) Derived State & Invariants

- Derived value: `authorized` flag in Gate component
  - Source: `usePermissions().hasRole(role)` for each role in the `requires` prop, checked against `user.roles` from AuthContext
  - Writes / cleanup: Determines whether children or fallback renders. No cache writes.
  - Guards: AuthGate must have resolved before Gate runs; if `user` is null, `hasRole` returns false.
  - Invariant: Gate must re-evaluate when auth context changes. Since auth is fetched once on mount and cached with `staleTime: Infinity`, the Gate output is stable for the session lifetime.
  - Evidence: `src/components/auth/gate.tsx:39-52`

- Derived value: `isAuthenticated` from AuthContext
  - Source: `useAuth()` returns `isAuthenticated: true` when `/api/auth/self` returns user data
  - Writes / cleanup: AuthGate blocks rendering until this resolves
  - Guards: AuthProvider emits test events for auth state transitions (`auth` scope, `loading` / `ready` / `error` phases)
  - Invariant: Children of AuthGate only mount after `isAuthenticated` becomes true
  - Evidence: `src/contexts/auth-context.tsx:59-106`, `src/components/auth/auth-gate.tsx:137-158`

- Derived value: Test session roles
  - Source: `AuthFactory.createSession({ roles })` -> backend stores session -> `/api/auth/self` reads it
  - Writes / cleanup: Setting a new session replaces the previous one for that browser context
  - Guards: `createSession` throws on non-2xx response
  - Invariant: Roles set via the testing endpoint must match exactly what `/api/auth/self` returns
  - Evidence: `tests/support/helpers/auth-factory.ts:29-47`

---

## 7) State Consistency & Async Coordination

- Source of truth: Backend session (set via testing endpoint), surfaced through React Query cache for `getAuthSelf`
- Coordination: `AuthProvider` wraps the tree and provides user info through context. `Gate` reads from this context synchronously. No derived caches need invalidation since tests create the session before navigating.
- Async safeguards: `auth.createSession()` completes before `page.goto()` runs. The `waitForListLoading` helpers ensure data queries have resolved before assertions run. The auth context emits `ui_state` events (`scope: 'auth'`, `phase: 'ready'`) that can be awaited if needed.
- Instrumentation: `AuthProvider` emits `ui_state` events for auth lifecycle. List pages emit `list_loading` events. No new instrumentation is needed for this change.
- Evidence: `src/contexts/auth-context.tsx:62-90`, `tests/support/helpers.ts:85-86`

---

## 8) Errors & Edge Cases

- Failure: `createSession` fails (backend test endpoint not available)
- Surface: Test setup phase (before navigation)
- Handling: AuthFactory throws an error, Playwright marks the test as failed
- Guardrails: The managed services fixture ensures the backend is running before tests start
- Evidence: `tests/support/helpers/auth-factory.ts:42-46`

- Failure: Reader tries to access a page with only gated content (e.g., empty boxes list with only a gated CTA)
- Surface: BoxList component
- Handling: The Gate around the empty-state CTA has a fallback that renders the EmptyState without the action button. Reader sees the message but not the create CTA.
- Guardrails: The fallback prop on the Gate provides the degraded UI
- Evidence: `src/components/boxes/box-list.tsx:241-269`

- Failure: Race between session creation and page navigation
- Surface: Test orchestration
- Handling: `createSession` awaits the HTTP response before returning; `page.goto` runs after. Cookies are set on the correct origin (frontend URL, proxied to backend).
- Guardrails: The fixture wires AuthFactory to use `page.request` so cookies persist in the browser context
- Evidence: `tests/support/fixtures-infrastructure.ts:292-298`

---

## 9) Observability / Instrumentation

- Signal: `ui_state` event (`scope: 'auth'`, `phase: 'ready'`)
- Type: Instrumentation event
- Trigger: AuthProvider emits when `isAuthenticated && user` becomes true
- Labels / fields: `{ userId: user.subject }`
- Consumer: Can be used in Playwright to await auth readiness (though `waitForListLoading` on page-specific scopes is more practical for these tests)
- Evidence: `src/contexts/auth-context.tsx:73-79`

- Signal: `list_loading` events (`boxes.list`, `boxes.detail`, `parts.detail`, `kits.detail`, etc.)
- Type: Instrumentation event
- Trigger: When query data loads or errors
- Labels / fields: scope-specific metadata (counts, keys, etc.)
- Consumer: `waitForListLoading(page, scope, phase)` in Playwright helpers
- Evidence: `src/components/boxes/box-list.tsx:77-104`, `tests/support/helpers.ts:85-86`

No new instrumentation signals are needed. The existing events are sufficient for deterministic test orchestration.

---

## 10) Lifecycle & Background Work

No new lifecycle hooks or background work is introduced. The spec uses existing page navigation and assertion patterns. Session creation is a one-shot HTTP call before navigation.

---

## 11) Security & Permissions

- Concern: Role-based visibility enforcement
- Touchpoints: `Gate` component in boxes, parts, kits, pick-lists, seller-link-section
- Mitigation: The frontend Gate is a UX convenience; the backend enforces `x-required-role` on every endpoint. Even if a reader bypassed the frontend gate, mutation API calls would fail with 403.
- Residual risk: None -- frontend gating is defense-in-depth, not the security boundary
- Evidence: `src/components/auth/gate.tsx:1-8` (docstring states backend enforces roles)

---

## 12) UX / UI Impact

No UX changes are introduced. This plan only adds test coverage and documentation for the existing role-gating behavior.

---

## 13) Deterministic Test Plan

- Surface: Boxes list page -- reader role
- Scenarios:
  - Given a reader-role session, When navigating to `/boxes`, Then the box list renders with cards and summary visible
  - Given a reader-role session on the boxes list, When inspecting the actions area, Then the "Add Box" button (`boxes.list.add`) is not visible
- Instrumentation / hooks: `waitForListLoading(page, 'boxes.list', 'ready')`, `boxes.addButton` locator from BoxesPage
- Gaps: None
- Evidence: `src/components/boxes/box-list.tsx:135-143`, `tests/support/page-objects/boxes-page.ts:10-24`

- Surface: Box detail page -- reader role
- Scenarios:
  - Given a reader-role session and an existing box, When navigating to the box detail, Then the detail content renders (summary, locations)
  - Given a reader-role session on box detail, When inspecting the actions area, Then edit and delete buttons (`boxes.detail.actions.edit`, `boxes.detail.actions.delete`) are not visible
- Instrumentation / hooks: `waitForListLoading(page, 'boxes.detail', 'ready')`, `boxes.detailEditButton`, `boxes.detailDeleteButton` locators
- Gaps: None
- Evidence: `src/components/boxes/box-details.tsx:248-263`, `tests/support/page-objects/boxes-page.ts:142-148`

- Surface: Parts detail page -- reader role
- Scenarios:
  - Given a reader-role session and an existing part, When navigating to the part detail, Then the detail content renders (information card, locations)
  - Given a reader-role session on part detail, When inspecting the actions area, Then edit, delete, and overflow menu buttons (`parts.detail.actions.edit`, `parts.detail.actions.delete`, `parts.detail.actions.menu`) are not visible
- Instrumentation / hooks: `waitForListLoading(page, 'parts.detail', 'ready')`, `parts.editPartButton`, `parts.deletePartButton`, `parts.overflowMenuButton` locators
- Gaps: None
- Evidence: `src/components/parts/part-details.tsx:291-328`, `tests/support/page-objects/parts-page.ts:323-337`

- Surface: Seller link fallback -- reader role
- Scenarios:
  - Given a reader-role session and a part with seller links, When viewing the seller links section, Then the remove button is visible but disabled (Gate fallback renders a disabled button with `title="Editor role required"`)
  - Given a reader-role session on part detail, When inspecting the seller links section, Then the "Add Seller Link" button (`parts.detail.seller-links.add-button`) is not visible (Gate without fallback)
- Instrumentation / hooks: `parts.sellerLinksSection`, `parts.sellerLinksAddButton`, `parts.sellerLinkRemoveButton(row)` locators
- Gaps: Requires seeding a part with at least one seller link to verify the fallback. This is done via factory in test setup.
- Evidence: `src/components/parts/seller-link-section.tsx:132-179`, `tests/support/page-objects/parts-page.ts:427-472`

- Surface: Kits detail page -- reader role
- Scenarios:
  - Given a reader-role session and an existing kit, When navigating to the kit detail, Then the kit detail renders (BOM table, header)
  - Given a reader-role session on kit detail, When inspecting the actions area, Then Order Stock (`kits.detail.actions.order-stock`), Edit Kit (`kits.detail.actions.edit`), and More Actions menu (`kits.detail.actions.menu`) are not visible
  - Given a reader-role session on kit detail, When inspecting the BOM card, Then the "Add part" button (`kits.detail.table.add`) is not visible
- Instrumentation / hooks: `waitForListLoading(page, 'kits.detail', 'ready')`, `kits.detailOrderButton`, `kits.detailEditButton`, `kits.detailMenuButton`, `kits.detailAddPartButton` locators
- Gaps: None
- Evidence: `src/components/kits/kit-detail-header.tsx:255-326`, `src/components/kits/kit-detail.tsx:611-626`, `tests/support/page-objects/kits-page.ts:109-136`

- Surface: Pick-list detail page -- reader role
- Scenarios:
  - Given a reader-role session and an existing pick list, When navigating to the pick list detail, Then the detail content renders (title, metadata, lines)
  - Given a reader-role session on pick list detail, When inspecting the actions area, Then the "Delete Pick List" button (`pick-lists.detail.actions.delete`) is not visible while the "View PDF" button (`pick-lists.detail.actions.view-pdf`) remains visible
- Instrumentation / hooks: `waitForListLoading(page, 'pick-lists.detail', 'ready')`, `pickLists.deleteButton` locator
- Gaps: Requires seeding a kit and then creating a pick list via `testData.kits.createPickList()`
- Evidence: `src/components/pick-lists/pick-list-detail.tsx:326-335`, `tests/support/page-objects/pick-lists-page.ts:19,32`

- Surface: Editor-role contrasting test
- Scenarios:
  - Given an editor-role session (`roles: ['reader', 'editor']`), When navigating to `/boxes`, Then the "Add Box" button IS visible
  - Given an editor-role session on box detail, Then edit and delete buttons ARE visible
  - Given an editor-role session on parts detail, Then edit, delete, and overflow menu ARE visible
  - Given an editor-role session on kits detail, Then Order Stock, Edit Kit, More Actions, and Add Part button ARE visible
  - Given an editor-role session on pick list detail, Then the "Delete Pick List" button IS visible
- Instrumentation / hooks: Same locators as reader tests, asserting `toBeVisible()` instead
- Gaps: None
- Evidence: Same component files

- Surface: Navigation and read-only content -- reader role
- Scenarios:
  - Given a reader-role session, When navigating between `/boxes`, `/parts`, `/kits` via sidebar links, Then all pages load successfully and display their content
- Instrumentation / hooks: `appShell` page object sidebar locators, `waitForListLoading` for each list scope
- Gaps: None
- Evidence: `tests/support/page-objects/app-shell-page.ts`

---

## 14) Implementation Slices

- Slice: 1 -- Playwright spec
- Goal: Add `tests/e2e/auth/role-gating.spec.ts` with reader-role and editor-role test groups
- Touches: `tests/e2e/auth/role-gating.spec.ts` (new)
- Dependencies: Requires seed data (boxes, parts with seller links, kits, pick-lists) created via factories in `beforeEach` or test body

- Slice: 2 -- CLAUDE.md documentation
- Goal: Add "Role Gating" section to CLAUDE.md
- Touches: `CLAUDE.md` (edit)
- Dependencies: None (documentation only)

- Slice: 3 -- Verification
- Goal: Confirm `pnpm check` passes and all existing Playwright specs remain green
- Touches: No file changes
- Dependencies: Slices 1 and 2 complete

---

## 15) Risks & Open Questions

- Risk: Reader-role session causes 403 errors on mutation endpoints if the test accidentally triggers a write path
- Impact: Console error policy would fail the test
- Mitigation: Reader tests only navigate and assert visibility; they never click gated buttons (because those buttons are not visible). If an unexpected 403 occurs, the console error allowlist in `fixtures-infrastructure.ts:189-191` already permits 403 errors.

- Risk: Test backend auto-auth grants roles that conflict with explicit `createSession` calls
- Impact: Reader tests could see editor controls if the session is not properly set
- Mitigation: `createSession` is called via `page.request` (sharing the browser context's cookie jar). The test endpoint replaces the session entirely. This is the same mechanism used by the existing auth specs (`tests/infrastructure/auth/auth.spec.ts`).

- Risk: Seed data created via API factories might be affected by the browser session's role restrictions
- Impact: Factory calls could fail if they were routed through a reader-only session
- Mitigation: The `testData` factories use a Node-level API client (`tests/api/client.ts` via `globalThis.fetch`) that connects directly to the backend URL, completely bypassing the browser's session and cookie jar. This means factory seeding is never subject to the browser session's role restrictions. The correct ordering is: (1) seed data via `testData` factories, (2) set the reader session via `auth.createSession({ roles: ['reader'] })`, (3) navigate with `page.goto()`.

---

## 16) Confidence

Confidence: High -- The Gate component, generated role constants, AuthFactory, and page object locators are all well-established and tested. The spec adds assertion-only coverage over existing UI behavior with no source code changes. The CLAUDE.md update is straightforward documentation.
