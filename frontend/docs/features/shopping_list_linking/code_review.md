### 1) Summary & Decision
**Readiness**
Kit detail now exposes the order-to-list flow with tested instrumentation, cache invalidation, and unlink affordances across both kit and shopping list surfaces (`src/components/kits/kit-detail.tsx:133`, `src/components/kits/kit-shopping-list-dialog.tsx:105`, `src/hooks/use-kit-shopping-list-links.ts:22`, `src/components/shopping-lists/detail-header-slots.tsx:124`).

**Decision**
GO — Implementation matches the amended scope (preview/prefix removed per plan preface) and ships comprehensive e2e coverage (`docs/features/shopping_list_linking/plan.md:3`, `tests/e2e/kits/kit-detail.spec.ts:580`, `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:8`).

### 2) Conformance to Plan (with evidence)
**Plan alignment**
- `In scope — Add kit detail CTA + dialog` ↔ `src/components/kits/kit-detail.tsx:133` / `src/components/kits/kit-shopping-list-dialog.tsx:105` — CTA gating archived/empty kits and dialog submission that hits `POST /api/kits/{kit_id}/shopping-lists`.
- `Flow: Unlink shopping list chip from kit detail` ↔ `src/components/kits/kit-detail.tsx:140` / `src/hooks/use-kit-shopping-list-links.ts:184` — Unlink confirmation drives mutation, instrumentation, and refetch.
- `Flow: Shopping list detail linked kit chips` ↔ `src/components/shopping-lists/detail-header-slots.tsx:124` / `src/components/shopping-lists/shopping-list-link-chip.tsx:37` — Detail header renders navigable chips with status badges.
- `Observability / Instrumentation` ↔ `src/components/kits/kit-detail.tsx:84`, `src/components/kits/kit-shopping-list-dialog.tsx:117`, `src/components/shopping-lists/detail-header-slots.tsx:131` — List loading scopes and UI-state events align with Playwright waiters.

**Gaps / deviations**
- `Plan still references the removed preview panel` — Preface notes the removal, but sections 5–6 retain preview derivations; code leaves preview out entirely (`docs/features/shopping_list_linking/plan.md:3`, `docs/features/shopping_list_linking/plan.md:162`).
- `Plan still mentions a read-only note prefix` — Implementation now hardcodes `notePrefix: null`, matching the change log note (`docs/features/shopping_list_linking/plan.md:5`, `src/components/kits/kit-shopping-list-dialog.tsx:140`).

### 3) Correctness — Findings (ranked)
None.

### 4) Over-Engineering & Refactoring Opportunities
None.

### 5) Style & Consistency
None.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- <test_coverage_template>
- Surface: Kit detail shopping list flow
  - Scenarios:
    - Given a populated active kit, When I order stock into a Concept list, Then instrumentation emits `kits.detail.shoppingListFlow` success and chips update (`tests/e2e/kits/kit-detail.spec.ts:580`)
    - Given an existing link, When I confirm unlink, Then `kits.detail.links` ready metadata drops the list id (`tests/e2e/kits/kit-detail.spec.ts:624`)
  - Hooks: `waitForUiState` (`kits.detail.shoppingListFlow`), `waitTestEvent` for `kits.detail.links`, toast assertions (`tests/e2e/kits/kit-detail.spec.ts:596`)
  - Gaps: None — flow covers submit, success, and refetch.
  - Evidence: `tests/e2e/kits/kit-detail.spec.ts:580`
- </test_coverage_template>
- <test_coverage_template>
- Surface: Shopping list detail attribution chips
  - Scenarios:
    - Given a list linked from a kit, When I open the concept detail, Then kit chips render and navigate back to kit detail (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:8`)
  - Hooks: `waitForListLoading(page, 'shoppingLists.detail.kits', 'ready')` plus chip locators (`tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:44`)
  - Gaps: None.
  - Evidence: `tests/e2e/shopping-lists/shopping-lists-detail.spec.ts:8`
- </test_coverage_template>
- <test_coverage_template>
- Surface: Shopping list selector validation regression
  - Scenarios:
    - Given an existing Concept list, When I select it in the order dialog, Then the field clears validation and submit stays enabled (`tests/e2e/kits/kit-shopping-list-dialog.spec.ts:1`)
  - Hooks: `waitForListLoading(page, 'kits.detail.shoppingLists', 'ready')`, selector harness assertions (`tests/e2e/kits/kit-shopping-list-dialog.spec.ts:31`)
  - Gaps: None.
  - Evidence: `tests/e2e/kits/kit-shopping-list-dialog.spec.ts:1`
- </test_coverage_template>

### 7) Adversarial Sweep (must attempt ≥3 credible failures or justify none)
- <adversarial_proof_template>
- Checks attempted: Cache consistency after order/unlink, dialog gating for archived/empty kits, selector touch state clearing validation (`src/hooks/use-kit-shopping-list-links.ts:22`, `src/components/kits/kit-detail.tsx:133`, `src/components/kits/kit-shopping-list-dialog.tsx:75`)
- Evidence: `src/components/kits/kit-shopping-list-dialog.tsx:126`
- Why code held up: Mutations invalidate all dependent queries, CTA guards prevent illegal opens, and selector notifies `onTouched` so validation errors clear immediately.
- </adversarial_proof_template>

### 8) Invariants Checklist (table)
- <invariant_template>
- Invariant: Only active kits with BOM contents can open the order dialog.
  - Where enforced: `src/components/kits/kit-detail.tsx:133`
  - Failure mode: Archived/empty kits could trigger POST and backend 400s.
  - Protection: CTA/button disabled and early return in handler.
  - Evidence: `src/components/kits/kit-detail.tsx:160`
- </invariant_template>
- <invariant_template>
- Invariant: Orders require a Concept list and units ≥1 before submit.
  - Where enforced: `src/components/kits/kit-shopping-list-dialog.tsx:75`
  - Failure mode: Invalid payload hits backend and confuses toast messaging.
  - Protection: Form validation, submit guard, instrumentation error branch.
  - Evidence: `src/components/kits/kit-shopping-list-dialog.tsx:126`
- </invariant_template>
- <invariant_template>
- Invariant: Kit and shopping list caches refresh after mutations.
  - Where enforced: `src/hooks/use-kit-shopping-list-links.ts:22`
  - Failure mode: Chips/memberships display stale links post order/unlink.
  - Protection: Centralized invalidation for kit detail, memberships, and both list queries.
  - Evidence: `src/hooks/use-kit-shopping-list-links.ts:28`
- </invariant_template>

### 9) Questions / Needs-Info
None.

### 10) Risks & Mitigations (top 3)
- <risk_template>
- Risk: Plan still references preview/note-prefix features that were intentionally removed.
- Mitigation: Trim Sections 5–6 + payload notes so future contributors don’t reintroduce the UI (`docs/features/shopping_list_linking/plan.md:3`, `docs/features/shopping_list_linking/plan.md:162`).
- Evidence: `docs/features/shopping_list_linking/plan.md:5`
- </risk_template>
- <risk_template>
- Risk: Without the old preview table, large orders rely solely on the toast summary for impact feedback.
- Mitigation: Confirm product acceptance and keep `totalNeededQuantity` messaging prominent (`src/components/kits/kit-shopping-list-dialog.tsx:162`).
- Evidence: `src/components/kits/kit-shopping-list-dialog.tsx:165`
- </risk_template>
- <risk_template>
- Risk: Cache invalidation is centralized in `invalidateKitShoppingListCaches`; future query additions could be missed.
- Mitigation: Keep the helper authoritative for all kit↔list surfaces and extend it whenever new queries ship (`src/hooks/use-kit-shopping-list-links.ts:22`).
- Evidence: `src/hooks/use-kit-shopping-list-links.ts:37`
- </risk_template>

### 11) Confidence
<confidence_template>Confidence: High — UI flows, instrumentation, and e2e specs exercise order + unlink end-to-end against the real backend.</confidence_template>
