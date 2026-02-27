# Plan Review — Role Gating Playwright Tests + CLAUDE.md Documentation

## 1) Summary & Decision

**Readiness**

The plan is well-researched, clearly scoped, and implementation-ready. It covers a test-only change (new Playwright spec + CLAUDE.md documentation) with no source code modifications. The research log is thorough, correctly identifying all seven Gate usage sites, the existing page object locators, and the AuthFactory mechanism. The test plan section provides detailed Given/When/Then scenarios for every domain surface declared in scope, including boxes, parts (with seller link fallback), kits, and pick-lists. The session sequencing pattern is explicitly documented, and the data-seeding approach is unambiguous.

**Decision**

`GO` — The plan is complete, well-evidenced, and aligned with codebase conventions. All in-scope items have corresponding test scenarios, and the implementation ordering is clear.

## 2) Conformance & Fit (with evidence)

**Conformance to refs**

- `docs/commands/plan_feature.md` — Pass — All 16 required sections are present, templates are populated, and XML tags have been stripped. The User Requirements Checklist (section 1a) is included verbatim. `plan.md:69-81`
- `docs/product_brief.md` — Pass — The plan does not alter product behavior; it adds test coverage for an existing authorization UX. The product brief describes a single-user app, but the role-gating system is already built, and this plan simply validates it.
- `docs/contribute/architecture/application_overview.md` — Pass — The plan correctly identifies the generated API client layer, domain hooks, and test mode architecture. `plan.md:7-9` aligns with the architecture doc's generated hook and snake_case mapping conventions.
- `docs/contribute/testing/playwright_developer_guide.md` — Pass — The plan follows API-first data setup (factories seed data, not UI, per `plan.md:133`), uses deterministic waits (`waitForListLoading`, per `plan.md:142`), avoids route interception, and relies on existing page objects (`plan.md:19`).
- `docs/contribute/testing/factories_and_fixtures.md` — Pass — `plan.md:342` correctly identifies that seed data is created via factories. The plan uses `testData` and `auth` fixtures as documented.

**Fit with codebase**

- `AuthFactory` — `plan.md:100-102` — Confirmed. `AuthFactory.createSession` at `tests/support/helpers/auth-factory.ts:29-40` sends `roles` in the POST body and defaults to `[]` when unspecified. The plan correctly notes that existing auth specs do not pass `roles` explicitly.
- `testData` API client — `plan.md:133,366-368` — The plan correctly states factories use a Node-level API client (`tests/api/client.ts` via `globalThis.fetch`) that bypasses the browser session. The ordering (seed first, then set session, then navigate) is explicitly documented in both section 5 and section 15.
- `Gate` component — `plan.md:7-8` — Confirmed. `src/components/auth/gate.tsx:39-52` checks `roles.some(role => hasRole(role))` and renders children or fallback. The plan's description matches the actual implementation.
- Page object locators — `plan.md:19` — Confirmed. `BoxesPage.addButton` maps to `boxes.list.add`, `BoxesPage.detailEditButton` maps to `boxes.detail.actions.edit`, `PartsPage.editPartButton` maps to `parts.detail.actions.edit`, `KitsPage.detailEditButton` maps to `kits.detail.actions.edit`, `PickListsPage.deleteButton` maps to `pick-lists.detail.actions.delete`. All locators exist in the respective page object files.
- Console error policy — `plan.md:360` — The infrastructure fixtures already allow 403/FORBIDDEN console errors at `fixtures-infrastructure.ts:188-191`, so reader-role navigation will not cause spurious test failures.

## 3) Open Questions & Ambiguities

- Question: Does the test backend's auto-authentication (when no explicit `createSession` is called) grant the `editor` role?
- Why it matters: The plan assumes (`plan.md:63`) "existing tests (which do not call `auth.createSession`) will continue working with editor-level access by default."
- Needed answer: Confirmed by inference. Existing Playwright specs click editor-gated buttons (create boxes, edit parts, etc.) without ever calling `createSession` with `roles`. Since those tests pass, auto-auth must grant `editor`. The assumption holds.

No blocking open questions remain.

## 4) Deterministic Playwright Coverage (new/changed behavior only)

- Behavior: Boxes list and detail -- reader role gating
- Scenarios:
  - Given a reader-role session, When navigating to `/boxes`, Then box list renders but "Add Box" button is not visible (`tests/e2e/auth/role-gating.spec.ts`)
  - Given a reader-role session on box detail, When inspecting actions, Then edit and delete buttons are not visible (`tests/e2e/auth/role-gating.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'boxes.list', 'ready')`, `waitForListLoading(page, 'boxes.detail', 'ready')`, `boxes.addButton`, `boxes.detailEditButton`, `boxes.detailDeleteButton`
- Backend hooks: `testData.boxes.create()` or `testData.boxes.createWithLocations()` to seed a box
- Gaps: None
- Evidence: `plan.md:268-282`

- Behavior: Parts detail -- reader role gating (including seller link fallback)
- Scenarios:
  - Given a reader-role session and an existing part with seller links, When viewing part detail, Then edit/delete/menu are not visible (`tests/e2e/auth/role-gating.spec.ts`)
  - Given a reader-role session, When viewing seller links, Then remove buttons are visible but disabled (fallback), and "Add Seller Link" is not visible (`tests/e2e/auth/role-gating.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'parts.detail', 'ready')`, `parts.editPartButton`, `parts.deletePartButton`, `parts.overflowMenuButton`, `parts.sellerLinksAddButton`, `parts.sellerLinkRemoveButton(row)`
- Backend hooks: `testData.parts.create()` + `testData.sellers.createPartSellerLink()` to seed a part with seller links
- Gaps: None
- Evidence: `plan.md:284-298`

- Behavior: Kits detail -- reader role gating
- Scenarios:
  - Given a reader-role session and an existing kit, When viewing kit detail, Then Order Stock, Edit Kit, More Actions menu, and Add Part button are not visible (`tests/e2e/auth/role-gating.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')`, `kits.detailOrderButton`, `kits.detailEditButton`, `kits.detailMenuButton`, `kits.detailAddPartButton`
- Backend hooks: `testData.kits.createWithContents()` to seed a kit with BOM entries
- Gaps: None
- Evidence: `plan.md:300-307`

- Behavior: Pick-list detail -- reader role gating
- Scenarios:
  - Given a reader-role session and an existing pick list, When viewing pick list detail, Then the "Delete Pick List" button is not visible while the "View PDF" button remains visible (`tests/e2e/auth/role-gating.spec.ts`)
- Instrumentation: `waitForListLoading(page, 'pick-lists.detail', 'ready')`, `pickLists.deleteButton`
- Backend hooks: `testData.kits.createPickList()` to seed a pick list (requires a kit first)
- Gaps: None
- Evidence: `plan.md:309-315`

- Behavior: Editor-role contrasting test
- Scenarios:
  - Given an editor-role session, When navigating to boxes/parts/kits/pick-list pages, Then all gated controls ARE visible (`tests/e2e/auth/role-gating.spec.ts`)
- Instrumentation: Same locators as reader tests, asserting `toBeVisible()`
- Backend hooks: Same seed data as reader tests
- Gaps: None
- Evidence: `plan.md:317-326`

All in-scope surfaces have corresponding test scenarios with identified instrumentation and backend hooks. No coverage gaps remain.

## 5) Adversarial Sweep (must find >=3 credible issues or declare why none exist)

- Checks attempted: Missing test scenario for in-scope domain (pick-lists)
- Evidence: `plan.md:46` (in-scope list includes pick-lists), `plan.md:309-315` (pick-list scenario present in section 13)
- Why the plan holds: The pick-list detail scenario is now present, covering the gated Delete button and the non-gated View PDF button. The editor contrasting test at `plan.md:323` also includes pick-list assertions.

- Checks attempted: Session sequencing ambiguity between factory seeding and role assignment
- Evidence: `plan.md:133` (step 1 of reader flow explicitly seeds via Node-level factories), `plan.md:134` (step 2 sets reader session), `plan.md:366-368` (risk section commits to the definitive ordering)
- Why the plan holds: The plan explicitly documents the three-step ordering (seed, set session, navigate) in both the UI flow description and the risks section. The rationale (Node-level client bypasses browser cookies) is stated with the source file reference.

- Checks attempted: Stale React Query cache after session switch (would a cached auth response from a prior session leak into the reader test?)
- Evidence: `plan.md:173` ("auth is fetched once on mount and cached with staleTime: Infinity"), `plan.md:195` ("No derived caches need invalidation since tests create the session before navigating")
- Why the plan holds: Each Playwright test gets a fresh page. The `auth.createSession()` call sets the cookie before `page.goto()`, so the first `/api/auth/self` fetch on page load returns the reader session. There is no prior cached auth state to leak because the page is new.

- Checks attempted: Console error from background query loading (e.g., React Query refetch hitting a 403)
- Evidence: `plan.md:360` (403 errors are allowed in the console error policy at `fixtures-infrastructure.ts:188-191`)
- Why the plan holds: Even if background queries trigger 403 errors (which they should not, since reader GET endpoints do not require editor role), the infrastructure fixtures already suppress 403 console errors.

- Checks attempted: Missing instrumentation for Gate component visibility changes (no test events emitted when Gate hides/shows content)
- Evidence: `plan.md:240` ("No new instrumentation signals are needed"), `src/components/auth/gate.tsx:39-52` (Gate is a pure render function with no instrumentation)
- Why the plan holds: The plan correctly relies on existing `waitForListLoading` events to wait for page readiness, then asserts visibility/invisibility of specific elements. Gate does not need its own instrumentation because the assertions target the DOM elements directly. The `waitForListLoading` events ensure the page has rendered before the visibility checks run.

No credible issues found. The plan addresses all targeted fault lines.

## 6) Derived-Value & State Invariants (table)

- Derived value: `authorized` flag in Gate component
  - Source dataset: `user.roles` from AuthContext (unfiltered -- the full role array from `/api/auth/self`)
  - Write / cleanup triggered: Determines child vs. fallback rendering. No cache writes, no navigation, no storage mutation.
  - Guards: AuthGate must resolve before Gate runs; `user` is never null within the gated tree.
  - Invariant: `authorized` must reflect the roles from the most recent `/api/auth/self` response. Since auth is fetched once per session with `staleTime: Infinity`, this value is stable for the session lifetime.
  - Evidence: `plan.md:169-174`, `src/components/auth/gate.tsx:39-52`

- Derived value: `isAuthenticated` from AuthContext
  - Source dataset: `/api/auth/self` query result (unfiltered -- single source)
  - Write / cleanup triggered: AuthGate blocks or unblocks the entire app tree. No persistent writes.
  - Guards: AuthProvider emits `ui_state` events when authentication completes.
  - Invariant: Children of AuthGate render only after `isAuthenticated` becomes true.
  - Evidence: `plan.md:176-181`, `src/contexts/auth-context.tsx:59-106`

- Derived value: Test session roles (browser-scoped)
  - Source dataset: `AuthFactory.createSession({ roles })` sets the session via `page.request.post`
  - Write / cleanup triggered: Setting a new session replaces the previous one. `clearSession` removes cookies.
  - Guards: `createSession` throws on non-2xx response. Session is set before `page.goto`.
  - Invariant: Roles passed to `createSession` must exactly match what `/api/auth/self` returns.
  - Evidence: `plan.md:183-188`, `tests/support/helpers/auth-factory.ts:29-47`

No derived values drive persistent writes or cache mutations. No Major flags apply.

## 7) Risks & Mitigations (top 3)

- Risk: Reader-role tests may encounter unexpected console errors from background queries or mutation-adjacent endpoints.
- Mitigation: The infrastructure fixtures already allow 403/FORBIDDEN console errors (`fixtures-infrastructure.ts:188-191`). Reader tests only navigate and assert visibility -- no mutations are triggered.
- Evidence: `plan.md:358-360`

- Risk: Test backend auto-auth could interfere with explicit `createSession` role assignments if session replacement is not atomic.
- Mitigation: `createSession` is called via `page.request` (sharing the browser context's cookie jar). The test endpoint replaces the session entirely, as confirmed by existing auth specs that use the same mechanism.
- Evidence: `plan.md:362-364`, `tests/infrastructure/auth/auth.spec.ts:19`

- Risk: Pick-list seeding requires a multi-step factory chain (create kit, then create pick list) which adds test setup complexity.
- Mitigation: The `testData.kits.createPickList()` helper already encapsulates this chain. The factory pattern is consistent with how other specs seed complex entities.
- Evidence: `plan.md:314`, `tests/api/index.ts:105-106`

## 8) Confidence

Confidence: High — The plan is thorough, all in-scope surfaces have corresponding test scenarios, the session sequencing is unambiguous, and the implementation relies entirely on existing infrastructure (Gate, AuthFactory, page objects, factories). No source code changes are required.
