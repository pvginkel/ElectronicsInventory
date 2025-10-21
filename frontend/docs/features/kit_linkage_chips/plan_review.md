### 1) Summary & Decision
**Readiness**
Plan surfaces the right files and instrumentation hooks, but critical blockers remain: the reusable chip API demands props `PartDetails` cannot supply, pick-list navigation points at a route that does not exist, and the deterministic test scenario depends on a stale flag without a seeding recipe (`docs/features/kit_linkage_chips/plan.md:121-133,185-189`). Implementation would stall as written.

**Decision**
`NO-GO` — Resolve the chip prop conflicts, routing target, and stale test seeding before moving forward.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md` — Fail — `docs/features/kit_linkage_chips/plan.md:131-133` — “`Link` navigates to `/pick-lists/<id>`…” contradicts the epic’s expectation that pick-list navigation land on an implemented workspace (`docs/epics/kits_feature_breakdown.md:151-157`), yet the route is absent today.
- `docs/contribute/testing/playwright_developer_guide.md` — Fail — `docs/features/kit_linkage_chips/plan.md:185-189` — “Given a kit with one stale shopping list…” omits how to create that stale fixture, clashing with “Create Data First… Never drive prerequisite flows through the UI… Use factory overrides to craft edge cases” (`docs/contribute/testing/playwright_developer_guide.md:96-118`).
- `docs/contribute/architecture/application_overview.md` — Mixed — `docs/features/kit_linkage_chips/plan.md:55-61` — introducing `src/components/link-chips/*` adds a new top-level bucket; the architecture guide calls for domain-grouped folders (“components grouped by domain (parts, boxes, types, layout, ui)” — `docs/contribute/architecture/application_overview.md:16-28`), so placement needs clarification.

**Fit with codebase**
- `src/components/parts/part-details.tsx` — `docs/features/kit_linkage_chips/plan.md:121-123` — plan expects chips to receive `isStale`/`requestedUnits`, but the memberships feeding PartDetails expose `listStatus`, `needed`, `ordered`, `received` only (`src/types/shopping-lists.ts:127-137`), so extraction breaks without an adapter.
- `src/routes` — `docs/features/kit_linkage_chips/plan.md:131-133` — repo currently ships `src/routes/{kits,shopping-lists,parts,…}` with no `pick-lists` module, so the proposed `/pick-lists/<id>` link has nowhere to land.
- `src/components/kits/kit-detail-header.tsx` — `docs/features/kit_linkage_chips/plan.md:111-114` — header slot assembly already centralises layout, so adding chip sorting there is feasible once the above blockers clear.

### 3) Open Questions & Ambiguities
- Question: How should we deterministically flip `isStale` for a kit-shopping-list link in Playwright?
  - Why it matters: Without a recipe, the headline test scenario cannot assert the stale warning.
  - Needed answer: Concrete backend steps (e.g., create link, mutate kit to bump `updated_at`, verify via API) that the test can apply.
- Question: What tooltip/content should the reusable shopping-list chip show when PartDetails’ memberships lack `honorReserved`/`requestedUnits`?
  - Why it matters: The plan expects those props for tooltips (`docs/features/kit_linkage_chips/plan.md:121-123`), but the data source does not provide them.
  - Needed answer: Either an adapter mapping or a scoped design that omits those fields for part chips.
- Question: Where should the shared chip component live to stay within the domain-driven structure?
  - Why it matters: `link-chips` is a new top-level bucket; we need confirmation that it belongs there or guidance to reuse `components/common`.
  - Needed answer: Decision on component placement that respects `docs/contribute/architecture/application_overview.md:16-28`.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail linkage chips
  - Scenarios:
    - Given a kit with one stale shopping list and one open pick list, When the detail page loads, Then chips render with statuses, stale icon, and `kits.detail.links` emits ready (`tests/e2e/kits/kit-detail.spec.ts`)
    - Given no linked lists, When detail loads, Then header shows empty copy (`tests/e2e/kits/kit-detail.spec.ts`)
    - Given chips visible, When clicking a shopping list chip, Then route event to `/shopping-lists/<id>` fires and destination loads (`tests/e2e/kits/kit-detail.spec.ts`)
  - Instrumentation: `waitForUiState(page, 'kits.detail.links', 'ready')`, `waitForListLoading(page, 'kits.detail', 'ready')`, router test events (`docs/features/kit_linkage_chips/plan.md:185-189`)
  - Backend hooks: Needs kit factory helpers plus API calls to create shopping/pick lists; additional steps required to mark a link stale.
  - Gaps: No documented path to seed `isStale === true`; pick-list navigation lacks a target route.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:185-189`
- Behavior: Part detail shopping list chips extraction
  - Scenarios:
    - Given concept + ready memberships, When memberships load, Then chips render and navigate (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
    - Given membership query errors, When retry succeeds, Then instrumentation emits loading → ready (`tests/e2e/shopping-lists/parts-entrypoints.spec.ts`)
  - Instrumentation: `waitForListLoading(page, 'parts.detail.shoppingLists', 'ready')`
  - Backend hooks: Existing part + shopping list factories suffice.
  - Gaps: Chip API currently expects props (stale/requestedUnits) that these memberships do not provide.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:192-197`

### 5) **Adversarial Sweep**
**Major — Reusable chip props mismatch**
**Evidence:** `docs/features/kit_linkage_chips/plan.md:121-123` — “Chip component receives `name`, `status`, `isStale`, `requestedUnits`…” vs. `src/types/shopping-lists.ts:127-137` — memberships expose `listName`, `listStatus`, `needed`, `ordered`, `received`, `note`, `seller` only.  
**Why it matters:** PartDetails cannot satisfy the proposed prop contract, so extraction either fails to compile or silently drops required tooltip data.  
**Fix suggestion:** Document an adapter (rename fields, make `isStale`/`requestedUnits` optional) or narrow scope to kit-only chips.  
**Confidence:** High

**Major — Pick-list navigation targets missing route**
**Evidence:** `docs/features/kit_linkage_chips/plan.md:131-133` — “`Link` navigates to `/pick-lists/<id>`…” while the repo lacks any `src/routes/pick-lists` module and the epic assumes such a workspace exists (`docs/epics/kits_feature_breakdown.md:151-157`).  
**Why it matters:** Shipping chips that redirect to a non-existent route yields a 404 and fails the navigation goal.  
**Fix suggestion:** Expand scope to include the pick-list detail route (even a placeholder) or adjust navigation to a supported destination.  
**Confidence:** High

**Major — Stale coverage lacks deterministic seeding**
**Evidence:** `docs/features/kit_linkage_chips/plan.md:185-189` — scenario requires a stale shopping list chip, but the doc notes `is_stale` is computed when `snapshot_kit_updated_at < kit.updated_at` (`docs/epics/kits_feature_breakdown.md:139-203`), and no seeding steps are described.  
**Why it matters:** Tests cannot guarantee the stale icon appears, undermining the headline coverage.  
**Fix suggestion:** Spell out backend calls (create link, mutate kit to bump `updated_at`, verify via API) or downgrade the scenario.  
**Confidence:** High

### 6) **Derived-Value & State Invariants (table)**
- Derived value: `sortedShoppingLinks`
  - Source dataset: `KitDetail.shoppingListLinks`
  - Write / cleanup triggered: Render ordering only (no cache writes)
  - Guards: Requires `detail` to exist before sorting (`docs/features/kit_linkage_chips/plan.md:139-145`)
  - Invariant: Sorted order must remain stable (status priority + name) so tests can rely on deterministic chip positions.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:139-145`
- Derived value: `staleShoppingCount`
  - Source dataset: Filtered `shoppingListLinks` where `isStale === true`
  - Write / cleanup triggered: Included in `kits.detail.links` instrumentation metadata
  - Guards: Only computed when detail is defined; otherwise defaults to zero.
  - Invariant: Metadata count matches the number of chips showing the stale indicator.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:144-145`
- Derived value: `hasLinkedWork`
  - Source dataset: `KitDetail.shoppingListLinks` + `KitDetail.pickLists`
  - Write / cleanup triggered: Toggles between chip list and empty-state copy
  - Guards: Requires safe handling when either array is undefined.
  - Invariant: Empty-state renders only when both arrays are empty; instrumentation still emits ready with zero counts.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:148-149`

### 7) Risks & Mitigations (top 3)
- Risk: Pick-list chips route to `/pick-lists/<id>` but no such route exists.
  - Mitigation: Add/stub the pick-list detail route or retarget navigation.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:131-133`; repo lacks `src/routes/pick-lists`.
- Risk: Shared chip API expects props missing from part memberships.
  - Mitigation: Define an adapter interface or limit the reusable component to datasets that supply those fields.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:121-123`; `src/types/shopping-lists.ts:127-137`.
- Risk: Stale chip scenario cannot be seeded deterministically.
  - Mitigation: Document backend operations that force `is_stale` or adjust test expectations.
  - Evidence: `docs/features/kit_linkage_chips/plan.md:185-189`; `docs/epics/kits_feature_breakdown.md:139-203`.

### 8) Confidence
Confidence: Low — Multiple blockers need clarification before work can begin, and the plan omits critical test data steps.
