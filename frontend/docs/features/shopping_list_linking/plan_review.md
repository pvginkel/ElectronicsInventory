### 1) Summary & Decision
**Readiness**
The plan scopes the right surfaces and APIs, but deterministic instrumentation and cache refresh steps are incomplete; the Playwright slice also omits the inline-create path it depends on, so another planning pass is needed before implementation. `docs/features/shopping_list_linking/plan.md:243` `docs/features/shopping_list_linking/plan.md:329` `docs/features/shopping_list_linking/plan.md:209` `docs/features/shopping_list_linking/plan.md:229` `docs/features/shopping_list_linking/plan.md:315`

**Decision**
`GO-WITH-CONDITIONS` — Resolve instrumentation coverage, cache invalidation, and inline-create test gaps to keep the feature shippable. `docs/features/shopping_list_linking/plan.md:243` `docs/features/shopping_list_linking/plan.md:209` `docs/features/shopping_list_linking/plan.md:229`

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/product_brief.md:74` — Pass — `docs/features/shopping_list_linking/plan.md:26` — “Add a kit detail CTA + dialog… before calling the kit shopping-list endpoint” keeps kits pushing shortages into shopping lists. 
- `docs/contribute/architecture/application_overview.md:33` — Pass — `docs/features/shopping_list_linking/plan.md:131` — “POST … using usePostKitsShoppingListsByKitId” reuses generated hooks as required.
- `docs/contribute/testing/playwright_developer_guide.md:85` — Fail — `docs/features/shopping_list_linking/plan.md:329` — “waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')” lacks a matching instrumentation signal in the plan’s telemetry section.

**Fit with codebase**
- `Kit detail caching` — `docs/features/shopping_list_linking/plan.md:209` — Cache list omits `useGetShoppingListsKitsByListId`, so shopping list detail chips risk stale links.
- `Shopping list selector instrumentation` — `docs/features/shopping_list_linking/plan.md:257` — Scope naming mixes `shoppingLists.selector.kitOrder` with `kits.detail.shoppingLists`; clarify target scope for `useListLoadingInstrumentation`.
- `Kit membership indicators` — `docs/features/shopping_list_linking/plan.md:324` — Overview indicator refresh depends on memberships but plan doesn’t spell out the query invalidation sequence.

### 3) Open Questions & Ambiguities
- Question: What instrumentation scope should expose the `shoppingLists.detail.kits` loading lifecycle so Playwright can wait deterministically?
  - Why it matters: Without a defined scope, `waitForListLoading` cannot be wired, blocking deterministic coverage.
  - Needed answer: Confirm whether to add a new `shoppingLists.detail.kits` list-loading signal or reuse an existing scope and document it. `docs/features/shopping_list_linking/plan.md:329`
- Question: Which React Query keys must be invalidated to refresh shopping list detail chips after link/unlink (e.g., `getShoppingListsKitsByListId`)?
  - Why it matters: Missing invalidation leaves detail pages stale, undermining navigation and badges.
  - Needed answer: Enumerate the exact query keys to invalidate/refetch alongside the existing `getKitsByKitId` and membership caches. `docs/features/shopping_list_linking/plan.md:209` `docs/features/shopping_list_linking/plan.md:143`

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail shopping list flow
  - Scenarios:
    - Given an active kit with BOM lines, When I order stock into a selected concept list, Then a chip appears with correct status and instrumentation reflects the target list (`tests/e2e/kits/kit-detail.spec.ts`). `docs/features/shopping_list_linking/plan.md:315`
  - Instrumentation: `kits.detail.shoppingListFlow` + `waitForListLoading(page, 'kits.detail.shoppingLists', 'ready')`. `docs/features/shopping_list_linking/plan.md:243` `docs/features/shopping_list_linking/plan.md:318`
  - Backend hooks: `POST /api/kits/{kit_id}/shopping-lists`. `docs/features/shopping_list_linking/plan.md:131`
  - Gaps: Major — No scenario covers the inline create fallback even though the plan relies on it when no concept lists exist. `docs/features/shopping_list_linking/plan.md:229`
  - Evidence: `docs/features/shopping_list_linking/plan.md:315`
- Behavior: Kit detail unlink action
  - Scenarios:
    - Given a linked kit, When I confirm unlink, Then the chip disappears after the ready event and membership indicator updates (`tests/e2e/kits/kit-detail.spec.ts`). `docs/features/shopping_list_linking/plan.md:323`
  - Instrumentation: `kits.detail.shoppingListFlow` success + `kits.detail.links` ready metadata. `docs/features/shopping_list_linking/plan.md:243` `docs/features/shopping_list_linking/plan.md:250`
  - Backend hooks: `DELETE /api/kit-shopping-list-links/{link_id}`. `docs/features/shopping_list_linking/plan.md:137`
  - Gaps: None noted.
  - Evidence: `docs/features/shopping_list_linking/plan.md:323`
- Behavior: Shopping list detail attribution
  - Scenarios:
    - Given a shopping list created from a kit, When I open list detail, Then kit chips render with correct name/status and navigate back (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts`). `docs/features/shopping_list_linking/plan.md:329`
  - Instrumentation: Expected `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')`, but no signal defined yet. `docs/features/shopping_list_linking/plan.md:329`
  - Backend hooks: `GET /api/shopping-lists/{list_id}/kits`. `docs/features/shopping_list_linking/plan.md:143`
  - Gaps: Major — Telemetry section omits this list-loading signal, so the test cannot be deterministic. `docs/features/shopping_list_linking/plan.md:243`
  - Evidence: `docs/features/shopping_list_linking/plan.md:329`

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
**Major — Missing list-detail instrumentation**
**Evidence:** `docs/features/shopping_list_linking/plan.md:329` / `docs/features/shopping_list_linking/plan.md:243` — “waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')” is planned, but the telemetry section only lists kit-detail signals.
**Why it matters:** Playwright cannot block on a signal that is never emitted, so the new attribution spec will flake or hang.
**Fix suggestion:** Add a `shoppingLists.detail.kits` list-loading signal (scope + metadata) in the instrumentation plan and wire it via `useListLoadingInstrumentation`.
**Confidence:** High

**Major — Stale shopping list detail cache**
**Evidence:** `docs/features/shopping_list_linking/plan.md:143` / `docs/features/shopping_list_linking/plan.md:209` — The plan introduces `GET /api/shopping-lists/{list_id}/kits` but the cache refresh list only names other queries.
**Why it matters:** After linking/unlinking from kit detail, shopping list detail chips will continue to show outdated associations, breaking navigation.
**Fix suggestion:** Explicitly invalidate/refetch the `getShoppingListsKitsByListId` query alongside kit detail and membership summaries.
**Confidence:** High

**Major — Inline-create flow untested**
**Evidence:** `docs/features/shopping_list_linking/plan.md:229` / `docs/features/shopping_list_linking/plan.md:315` — The plan relies on the selector’s inline create when no concept lists exist, yet the deterministic test plan lists only the existing-list scenario.
**Why it matters:** Without coverage, the critical fallback (creating a list inside the dialog) could regress unnoticed.
**Fix suggestion:** Add a Playwright scenario that seeds zero concept lists, drives the inline create path, and asserts the resulting chip + instrumentation.
**Confidence:** Medium

### 6) **Derived-Value & State Invariants (table)**
- Derived value: requestedUnitsInput
  - Source dataset: Kit build target and dialog input. `docs/features/shopping_list_linking/plan.md:186`
  - Write / cleanup triggered: Drives preview rows and mutation payload, reset on dialog close. `docs/features/shopping_list_linking/plan.md:188`
  - Guards: Clamp to integers ≥1 with disabled submit when invalid. `docs/features/shopping_list_linking/plan.md:189`
  - Invariant: Mutation must use the current positive requested units. `docs/features/shopping_list_linking/plan.md:190`
  - Evidence: `docs/features/shopping_list_linking/plan.md:186`
- Derived value: neededQuantityPerLine
  - Source dataset: Kit content totals plus honor-reserved toggle. `docs/features/shopping_list_linking/plan.md:194`
  - Write / cleanup triggered: Powers preview table and summary chips within dialog scope. `docs/features/shopping_list_linking/plan.md:195`
  - Guards: Memoize and floor at zero to prevent negative quantities. `docs/features/shopping_list_linking/plan.md:197`
  - Invariant: Preview must match the payload sent to the backend. `docs/features/shopping_list_linking/plan.md:198`
  - Evidence: `docs/features/shopping_list_linking/plan.md:194`
- Derived value: canLinkToList
  - Source dataset: Kit status, content count, and mutation pending state. `docs/features/shopping_list_linking/plan.md:200`
  - Write / cleanup triggered: Enables/disables CTA and submit, shows archived tooltip. `docs/features/shopping_list_linking/plan.md:202`
  - Guards: Block archived kits and empty BOMs ahead of mutation. `docs/features/shopping_list_linking/plan.md:203`
  - Invariant: Users cannot initiate linking when kit is archived or empty. `docs/features/shopping_list_linking/plan.md:204`
  - Evidence: `docs/features/shopping_list_linking/plan.md:200`

### 7) Risks & Mitigations (top 3)
- Risk: Playwright attribution spec cannot stabilize because the `shoppingLists.detail.kits` signal is undefined. 
  - Mitigation: Add explicit instrumentation scope and document it in the telemetry section. `docs/features/shopping_list_linking/plan.md:329`
  - Evidence: `docs/features/shopping_list_linking/plan.md:243`
- Risk: Shopping list detail chips stay stale after link/unlink due to missing `getShoppingListsKitsByListId` invalidation.
  - Mitigation: Enumerate and invalidate that query in the coordination plan. `docs/features/shopping_list_linking/plan.md:209`
  - Evidence: `docs/features/shopping_list_linking/plan.md:143`
- Risk: Inline-create fallback regresses silently because no deterministic test covers it.
  - Mitigation: Add a Playwright scenario that drives inline list creation within the dialog. `docs/features/shopping_list_linking/plan.md:229`
  - Evidence: `docs/features/shopping_list_linking/plan.md:315`

### 8) Confidence
Confidence: Medium — Core surfaces align with architecture, but outstanding instrumentation and coverage answers are required before execution feels safe.
