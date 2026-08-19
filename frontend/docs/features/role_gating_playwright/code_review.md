# Code Review -- Role Gating Playwright Tests + CLAUDE.md Documentation

## 1) Summary & Decision

**Readiness**

The implementation delivers a well-structured Playwright spec at `tests/e2e/auth/role-gating.spec.ts` covering reader-role and editor-role visibility across five domains (boxes, parts/seller-links, kits, pick-lists), plus a concise "Role Gating" documentation section in `AGENTS.md` (symlinked as `CLAUDE.md`). The spec follows project conventions: API-first data seeding via factories, deterministic waits using `waitForListLoading`, existing page objects, and no route interception. One correctness issue (silent failure on stock creation) warrants a minor fix, but it is not a blocker. The code is ready to ship.

**Decision**

`GO-WITH-CONDITIONS` -- Address the unwrapped `apiClient.POST` for stock creation (Major #1) before merging to ensure seed failures surface clearly in CI.

---

## 2) Conformance to Plan (with evidence)

**Plan alignment**

- `plan.md Section 1 (Intent & Scope)` -- "New Playwright spec at `tests/e2e/auth/role-gating.spec.ts`" -> delivered as `tests/e2e/auth/role-gating.spec.ts:1-277` (new file, 7 tests across 2 describe blocks).
- `plan.md Section 13 (Deterministic Test Plan) -- Boxes list reader` -> `tests/e2e/auth/role-gating.spec.ts:105-115` -- reader asserts `summary` visible, `addButton` not visible.
- `plan.md Section 13 -- Box detail reader` -> `tests/e2e/auth/role-gating.spec.ts:119-131` -- reader asserts `detailSummary`/`detailLocations` visible, `detailEditButton`/`detailDeleteButton` not visible.
- `plan.md Section 13 -- Parts detail reader` -> `tests/e2e/auth/role-gating.spec.ts:135-148` -- `detailLayout` visible, `editPartButton`/`deletePartButton`/`overflowMenuButton` not visible.
- `plan.md Section 13 -- Seller link fallback` -> `tests/e2e/auth/role-gating.spec.ts:152-171` -- remove button visible+disabled with `title="Editor role required"`, add button not visible.
- `plan.md Section 13 -- Kits detail reader` -> `tests/e2e/auth/role-gating.spec.ts:175-188` -- header actions and `detailAddPartButton` not visible.
- `plan.md Section 13 -- Pick-list detail reader` -> `tests/e2e/auth/role-gating.spec.ts:192-207` -- `deleteButton` not visible, `viewPdfButton` visible.
- `plan.md Section 13 -- Editor contrasting test` -> `tests/e2e/auth/role-gating.spec.ts:215-277` -- single test verifying all gated controls are visible with `roles: ['reader', 'editor']`.
- `plan.md Section 14 (Slice 2) -- CLAUDE.md documentation` -> `AGENTS.md:43-51` (diff lines) -- "Role Gating" section covering Gate, usePermissions, generated constants, ESLint rule, backend enforcement, and Playwright reference.

**Gaps / deviations**

- `plan.md Section 1a checklist item` -- "Reader-role tests verify read-only content remains accessible (lists, details, navigation)" -- The plan mentions a separate navigation test verifying sidebar navigation between `/boxes`, `/parts`, `/kits`. The spec does not include this as a standalone test; instead, navigation is implicitly exercised through the individual reader tests. This is a minor deviation since the implicit coverage is adequate, but the plan item is not directly satisfied with a dedicated navigation test.
- `plan.md Section 13 -- Kit detail BOM table` -- The plan says to assert "BOM table, header" for read-only content. The spec asserts `kits.detailLayout` (`tests/e2e/auth/role-gating.spec.ts:182`) but does not explicitly verify `kits.detailTable` or `kits.detailSummary`. Minor -- the layout assertion confirms the page loaded.

---

## 3) Correctness -- Findings (ranked)

- Title: **Major -- Stock creation call lacks error handling wrapper**
- Evidence: `tests/e2e/auth/role-gating.spec.ts:72-75` --
  ```typescript
  await apiClient.POST('/api/inventory/parts/{part_key}/stock', {
    params: { path: { part_key: part.key } },
    body: { box_no: box.box_no, loc_no: 1, qty: 10 },
  });
  ```
- Impact: If this POST fails (wrong box_no, backend error), the error is silently swallowed. The `openapi-fetch` client returns `{ data, error, response }` without throwing. Downstream steps (creating the pick list) would then fail with a confusing error about insufficient stock, making CI failures hard to diagnose.
- Fix: Wrap the call in `apiRequest()` (the module-level import from `../../api/client`), matching the pattern in the existing tooltip spec at `tests/e2e/ui/tooltip.spec.ts:37-41`:
  ```typescript
  const { apiRequest } = await import('../../api/client');
  ```
  Or, since the spec already imports `createApiClient`, use the attached helper:
  ```typescript
  await apiClient.apiRequest(() =>
    apiClient.POST('/api/inventory/parts/{part_key}/stock', {
      params: { path: { part_key: part.key } },
      body: { box_no: box.box_no, loc_no: 1, qty: 10 },
    })
  );
  ```
- Confidence: High

---

- Title: **Minor -- Kit-reservations response typed as partial projection**
- Evidence: `tests/e2e/auth/role-gating.spec.ts:56-60` --
  ```typescript
  const reservations = await apiClient.apiRequest<{ part_id: number }>(() =>
    apiClient.GET('/api/parts/{part_key}/kit-reservations', {
      params: { path: { part_key: part.key } },
    }),
  );
  ```
- Impact: The explicit type parameter `<{ part_id: number }>` overrides the inferred OpenAPI type, losing type safety on the response. The existing tooltip spec at `tests/e2e/ui/tooltip.spec.ts:37-42` omits the type parameter and lets inference work, then accesses `.part_id` directly with a runtime guard. This spec's approach is functionally correct but diverges from the established pattern.
- Fix: Drop the explicit type parameter and add a runtime guard, consistent with the tooltip spec:
  ```typescript
  const reservations = await apiClient.apiRequest(() =>
    apiClient.GET('/api/parts/{part_key}/kit-reservations', {
      params: { path: { part_key: part.key } },
    }),
  );
  const partId = reservations.part_id;
  if (typeof partId !== 'number') {
    throw new Error('Failed to resolve part id');
  }
  ```
- Confidence: High

---

- Title: **Minor -- Unused import of `createApiClient`**
- Evidence: `tests/e2e/auth/role-gating.spec.ts:16` --
  ```typescript
  import type { createApiClient, createTestDataBundle } from '../../api';
  ```
- Impact: Both `createApiClient` and `createTestDataBundle` are only used as `ReturnType<typeof ...>` in the `seedTestData` function signature. This is correct usage for type-only imports. No issue here -- this is a valid `import type` pattern.
- Fix: None needed.
- Confidence: High

---

## 4) Over-Engineering & Refactoring Opportunities

- Hotspot: The `seedTestData` helper function (`tests/e2e/auth/role-gating.spec.ts:30-88`) creates a box, part, seller, seller link, fetches kit-reservations for partId, creates a kit, adds content, stocks the part, and creates a pick list -- all for both the reader and editor describe blocks.
- Evidence: `tests/e2e/auth/role-gating.spec.ts:30-88` -- 58 lines of setup.
- Suggested refactor: None. The shared seed helper is the right abstraction here. It avoids duplicating the complex chain across two `beforeEach` blocks. The sequential factory calls are inherently ordered (part must exist before seller link, stock before pick list), so there is no parallelization opportunity.
- Payoff: N/A -- current structure is appropriate.

---

## 5) Style & Consistency

- Pattern: Section comment style using `// ===` and `// ---` delimiter lines
- Evidence: `tests/e2e/auth/role-gating.spec.ts:92-93`, `tests/e2e/auth/role-gating.spec.ts:103-104`
- Impact: Positive. The delimiter comments (`// ===` for describe block groups, `// ---` for individual test separators) improve scanability in a file with 277 lines. This matches the guidepost comment guidance in `CLAUDE.md` ("Add short guidepost comments in non-trivial functions to outline the flow").
- Recommendation: None -- well done.

---

- Pattern: Consistent use of page object locators over ad-hoc selectors
- Evidence: The spec uses `boxes.addButton`, `boxes.detailEditButton`, `parts.editPartButton`, `parts.sellerLinkRemoveButton(row)`, `kits.detailOrderButton`, `pickLists.deleteButton`, etc., throughout all 7 tests.
- Impact: Positive. Aligns with the Playwright developer guide's "Feature-owned page objects" principle and avoids brittle `getByTestId` calls scattered in tests.
- Recommendation: None.

---

- Pattern: CLAUDE.md section uses `--` (double dash) instead of em dash
- Evidence: `AGENTS.md:49` -- `"The frontend Gate is a UX convenience -- the backend enforces..."`
- Impact: Consistent with existing CLAUDE.md style (e.g., line 5: "contributor hub with setup, environment, testing, and how-to guides."). The `--` convention is used throughout the file.
- Recommendation: None -- matches existing style.

---

## 6) Tests & Deterministic Coverage (new/changed behavior only)

- Surface: Boxes list page -- reader role
- Scenarios:
  - Given a reader-role session, When navigating to `/boxes`, Then summary visible and box card visible (`tests/e2e/auth/role-gating.spec.ts:108-110`)
  - Given a reader-role session on boxes list, When inspecting actions, Then Add Box button not visible (`tests/e2e/auth/role-gating.spec.ts:113`)
- Hooks: `boxes.gotoList()` internally calls `waitForListLoading(page, 'boxes.list', 'ready')` per `tests/support/page-objects/boxes-page.ts:30-31`
- Gaps: None
- Evidence: `tests/e2e/auth/role-gating.spec.ts:105-115`

---

- Surface: Box detail page -- reader role
- Scenarios:
  - Given a reader-role session and seeded box, When opening detail, Then summary and locations visible (`tests/e2e/auth/role-gating.spec.ts:122-127`)
  - Given reader on box detail, Then edit and delete buttons not visible (`tests/e2e/auth/role-gating.spec.ts:130-131`)
- Hooks: `boxes.openDetail()` calls `waitForListLoading(page, 'boxes.detail', 'ready')` per `tests/support/page-objects/boxes-page.ts:90`
- Gaps: None
- Evidence: `tests/e2e/auth/role-gating.spec.ts:119-131`

---

- Surface: Part detail + seller link fallback -- reader role
- Scenarios:
  - Given reader with seeded part, Then detail layout visible, edit/delete/menu not visible (`tests/e2e/auth/role-gating.spec.ts:140-148`)
  - Given reader with seeded seller link, Then remove button visible but disabled with title "Editor role required", add button not visible (`tests/e2e/auth/role-gating.spec.ts:157-171`)
- Hooks: `parts.waitForDetailReady()` calls `waitForListLoading(page, 'parts.detail', 'ready')` per `tests/support/page-objects/parts-page.ts:177`
- Gaps: None
- Evidence: `tests/e2e/auth/role-gating.spec.ts:135-171`, confirmed against `src/components/parts/seller-link-section.tsx:132-158` (Gate with fallback)

---

- Surface: Kit detail -- reader role
- Scenarios:
  - Given reader with seeded kit, Then layout visible, order/edit/menu/add-part buttons not visible (`tests/e2e/auth/role-gating.spec.ts:180-188`)
- Hooks: `waitForListLoading(page, 'kits.detail', 'ready')` at line 181
- Gaps: None
- Evidence: `tests/e2e/auth/role-gating.spec.ts:175-188`

---

- Surface: Pick-list detail -- reader role
- Scenarios:
  - Given reader with seeded pick list, Then layout/title visible, delete button not visible, view PDF button visible (`tests/e2e/auth/role-gating.spec.ts:196-207`)
- Hooks: `waitForListLoading(page, 'pickLists.detail', 'ready')` at line 197
- Gaps: None
- Evidence: `tests/e2e/auth/role-gating.spec.ts:192-207`

---

- Surface: Editor-role contrasting test
- Scenarios:
  - Given editor session (`roles: ['reader', 'editor']`), When visiting all five domains, Then all gated controls are visible and enabled (`tests/e2e/auth/role-gating.spec.ts:227-275`)
  - Includes seller link remove button enabled assertion (`tests/e2e/auth/role-gating.spec.ts:259-261`) -- confirms Gate renders the real button, not the disabled fallback
- Hooks: Same `waitForListLoading` hooks as reader tests
- Gaps: None
- Evidence: `tests/e2e/auth/role-gating.spec.ts:215-277`

---

## 7) Adversarial Sweep (must attempt >=3 credible failures or justify none)

**Attempt 1: Race between `createSession` and `page.goto`**

- Checks attempted: Could the browser navigate before the session cookie is set, causing the page to load with default (editor) roles instead of reader?
- Evidence: `tests/support/helpers/auth-factory.ts:30-40` -- `createSession` uses `this.page.request.post()` which shares the browser context's cookie jar. The `await` ensures the response (and cookie) are received before the function returns. `tests/e2e/auth/role-gating.spec.ts:101-102` calls `auth.createSession()` before any navigation.
- Why code held up: Playwright's `page.request` uses the same `BrowserContext` cookie store. The `await` on the POST response guarantees the session cookie is set before `goto()` runs. No race is possible within a single `beforeEach`.

**Attempt 2: Seed data created through reader-restricted session**

- Checks attempted: Could the `testData` factories fail because the browser session is set to reader-only before data seeding completes?
- Evidence: `tests/e2e/auth/role-gating.spec.ts:98-102` -- seed order is (1) `seedTestData(testData, apiClient)` then (2) `auth.createSession({ roles: ['reader'] })`. The `testData` factories use the Node-level `apiClient` from `tests/api/client.ts:42-52` which uses `globalThis.fetch`, completely independent of the browser session.
- Why code held up: Factory calls bypass the browser entirely. Even if the order were reversed, factories would still succeed because they use a separate fetch context. The implementation correctly seeds before setting the restricted session.

**Attempt 3: Pick list creation fails due to insufficient stock**

- Checks attempted: The spec stocks 10 units (`tests/e2e/auth/role-gating.spec.ts:72-75`) then creates a pick list requesting 1 unit (`tests/e2e/auth/role-gating.spec.ts:80-82`). Could this fail?
- Evidence: The stock POST at line 72-75 is not wrapped in `apiRequest()`, so a failure would be silent. If it fails, `createPickList` at line 80-82 would fail with a shortfall error (no stock to pick from). However, the stock POST uses correct fields matching `AddStockSchema` (verified against `openapi-cache/openapi.json:337-362`): `box_no` (integer from seeded box), `loc_no: 1` (valid), `qty: 10` (positive integer).
- Why code held up: The fields are correct and the endpoint is valid, so the POST will succeed in practice. However, the missing `apiRequest` wrapper is a real diagnosability concern (see Major #1). The actual correctness is sound.

---

## 8) Invariants Checklist (table)

- Invariant: A reader-role session must see zero editor-only controls (buttons, menu triggers) across all tested pages.
  - Where enforced: `src/components/auth/gate.tsx:39-52` -- `Gate` returns `fallback` (or null) when `authorized` is false. `src/hooks/use-permissions.ts:29-31` -- `hasRole` checks `user.roles.includes(role)`.
  - Failure mode: If `AuthContext.user.roles` included `"editor"` despite `createSession({ roles: ['reader'] })`, all Gate components would render children.
  - Protection: `auth.createSession()` sets roles on the backend session; `/api/auth/self` returns exactly those roles; `AuthProvider` stores them in context with `staleTime: Infinity` so they remain stable for the session lifetime.
  - Evidence: `tests/support/helpers/auth-factory.ts:29-40`, `src/contexts/auth-context.tsx:73-79`

- Invariant: An editor-role session must see all gated controls as enabled (not the disabled fallback).
  - Where enforced: `src/components/auth/gate.tsx:48-49` -- when `authorized` is true, `children` render (not fallback). `tests/e2e/auth/role-gating.spec.ts:259-261` -- explicitly asserts `removeButton.toBeEnabled()` to distinguish from the Gate fallback.
  - Failure mode: If Gate's `roles.some(...)` check returned false despite the user having `"editor"`, the fallback would render. The editor test would fail on `toBeEnabled()`.
  - Protection: The editor session includes both `['reader', 'editor']`; `"editor".includes("editor")` is trivially true.
  - Evidence: `tests/e2e/auth/role-gating.spec.ts:225`, `src/components/auth/gate.tsx:46`

- Invariant: Factory-seeded data is independent of the browser session's role restrictions.
  - Where enforced: `tests/api/client.ts:42-48` -- `createApiClient` uses `globalThis.fetch`, not `page.request`. The Node-level client connects directly to the backend URL.
  - Failure mode: If factories used `page.request`, a reader session would cause 403 on mutation endpoints, failing test setup.
  - Protection: The factory client is constructed in the `apiClient` fixture (`tests/support/fixtures.ts:63-65`) with `createApiClient({ baseUrl: backendUrl })`, which never touches the browser context.
  - Evidence: `tests/support/fixtures.ts:63-65`, `tests/api/client.ts:42-48`

---

## 9) Questions / Needs-Info

No blocking questions. The implementation is self-contained and maps cleanly to the plan. All referenced page object locators, factory methods, and instrumentation events exist in the codebase.

---

## 10) Risks & Mitigations (top 3)

- Risk: Silent stock-seeding failure in `seedTestData` could produce confusing CI failures when the pick list creation step errors due to insufficient stock.
- Mitigation: Wrap the `apiClient.POST('/api/inventory/parts/{part_key}/stock', ...)` call in `apiClient.apiRequest()` so non-2xx responses throw immediately with a clear error message.
- Evidence: `tests/e2e/auth/role-gating.spec.ts:72-75`

- Risk: The editor contrasting test (`tests/e2e/auth/role-gating.spec.ts:227-275`) is a single large test visiting 5 domains. If it fails partway through, identifying the failing domain requires reading the stack trace rather than seeing a named test fail.
- Mitigation: Acceptable tradeoff -- the test reuses the same seed data and session, avoiding 5x the setup cost. The inline comment separators (`// -- Boxes list`, `// -- Box detail`, etc.) aid debugging. No action needed unless flakiness emerges.
- Evidence: `tests/e2e/auth/role-gating.spec.ts:227-275`

- Risk: Future Gate usage sites may not be covered by these tests, creating a false sense of completeness.
- Mitigation: The plan explicitly states "representative sampling suffices" (plan.md Section 1, Out of scope). The CLAUDE.md documentation (`AGENTS.md:48`) references the spec and plan, guiding future contributors to extend coverage when adding new Gate usages.
- Evidence: `docs/features/role_gating_playwright/plan.md:57`, `AGENTS.md:48`

---

## 11) Confidence

Confidence: High -- The implementation faithfully executes the plan, uses established project patterns (API factories, page objects, deterministic waits, no route mocking), and the single Major finding is a diagnosability improvement rather than a correctness bug.
