# Plan Review — Kit Detail & BOM Management

### 1) Summary & Decision
**Readiness**
The plan covers routing, detail query mapping, and optimistic mutation structure, but two core behaviors lack executable detail: it assumes `useListLoadingInstrumentation` can expose filter results without a loading transition ("Update `ListLoading` ready metadata with `filteredCount` for instrumentation." — docs/features/kit_detail_bom_management/plan.md:247-249; "Update ready metadata to include counts (`visible`, `filtered`, `shortfallCount`) so Playwright can assert deterministic state." — docs/features/kit_detail_bom_management/plan.md:290-294), and it never defines how the BOM rows will reflect new availability math after a build-target edit ("On success, update detail cache & kits overview entry, emit success toast, and track form success." — docs/features/kit_detail_bom_management/plan.md:219-220). Those gaps mean the spec would be non-deterministic and could ship stale availability numbers.

**Decision**
GO-WITH-CONDITIONS — close the instrumentation/reset gaps above and add deterministic coverage for 409 conflicts before implementation proceeds.

### 2) Conformance & Fit
**Conformance to refs**
- docs/contribute/architecture/application_overview.md:33 — Pass — docs/features/kit_detail_bom_management/plan.md:63-68 — "Wrap `useGetKitsByKitId` to map snake_case payloads into camelCase domain models..." keeps hook patterns consistent with the architecture guide.
- docs/epics/kits_feature_breakdown.md:55-83 — Fail — docs/features/kit_detail_bom_management/plan.md:215-223 — "On success, update detail cache & kits overview entry..." never covers recomputing `total_required` / `shortfall` after changing `build_target`, conflicting with "Show computed columns Required, Total, In stock, Reserved, Shortfall..." and "Reflect optimistic updates in the UI grid and re-fetch computed columns on success."
- docs/contribute/testing/playwright_developer_guide.md:128-138 — Fail — docs/features/kit_detail_bom_management/plan.md:247-252 — "Update `ListLoading` ready metadata with `filteredCount` for instrumentation." expects deterministic waits without a corresponding event, violating the guidance that tests rely on emitted events for real transitions.

**Fit with codebase**
- `useListLoadingInstrumentation` — docs/features/kit_detail_bom_management/plan.md:290-295 — Plan assumes metadata updates on filter changes even though the hook only fires on load/fetch transitions, so the implementation would need additional emit logic to fit existing helpers.
- `queryClient.setQueryData` usage — docs/features/kit_detail_bom_management/plan.md:278-279 — Extends the archive-control pattern, but must also touch derived rows to keep availability flags in sync with build-target edits.
- `use-kit-memberships` reuse — docs/features/kit_detail_bom_management/plan.md:75-77 — Aligns with current membership instrumentation scopes and avoids duplicating membership logic.

### 3) Open Questions & Ambiguities
- Question: How will the screen emit a new `list_loading` event when only the client-side filter changes?  
  Why it matters: Without a new event, `waitForListLoading` cannot unblock Playwright, breaking deterministic waits.  
  Needed answer: Decide whether to drive `useListLoadingInstrumentation` with a synthetic filtering state or emit a dedicated test event for filter application (and document it).
- Question: What mechanism keeps `total_required`, `available`, and `shortfall` accurate after a build-target edit?  
  Why it matters: Product brief demands live availability math; failing to recompute or refetch leaves stale numbers on screen.  
  Needed answer: Either trigger a detail refetch or recalculate rows locally with the new target before surfacing success.
- Question: How are 409 version conflicts and duplicate-part errors validated end-to-end?  
  Why it matters: The epic requires conflict handling, but the current deterministic coverage omits those paths, risking regressions.  
  Needed answer: Specify seeded backend flows and instrumentation expectations for conflict/error specs.

### 4) Deterministic Playwright Coverage
- Behavior: Kit detail metadata editing  
  - Scenarios: Given an active kit, When name/build target is edited and submitted, Then header reflects new values; Given an archived kit, When detail loads, Then inputs are disabled (`tests/e2e/kits/kits-detail.spec.ts`).  
  - Instrumentation: `waitForListLoading(page, 'kits.detail', 'ready')`, `waitTestEvent<FormTestEvent>(..., evt => evt.formId === 'KitDetail:metadata')` (docs/features/kit_detail_bom_management/plan.md:321-326).  
  - Backend hooks: `tests/api/factories/kit-factory.ts` to create active/archived kits (docs/features/kit_detail_bom_management/plan.md:362-364).  
  - Gaps: No scenario validates that BOM aggregates recompute or refetch after build-target changes, leaving the epic’s computed-column requirement untested (docs/epics/kits_feature_breakdown.md:55-62).  
  - Evidence: docs/features/kit_detail_bom_management/plan.md:321-327.
- Behavior: BOM add/edit/delete lifecycle  
  - Scenarios: Add row, edit quantity, delete row, expecting updated totals and instrumentation (`tests/e2e/kits/kits-detail.spec.ts`) (docs/features/kit_detail_bom_management/plan.md:329-334).  
  - Instrumentation: `waitForListLoading(page, 'kits.detail.contents', 'ready')`, `waitTestEvent` for `KitDetail:content.*` (docs/features/kit_detail_bom_management/plan.md:329-334).  
  - Backend hooks: `tests/api/factories/kit-factory.ts` seeding contents; optimistic locking via `version` (docs/features/kit_detail_bom_management/plan.md:225-238).  
  - Gaps: Conflict/duplicate-part paths mandated by "version conflicts raise 409" lack deterministic coverage, so instrumentation for conflict toasts is undefined (docs/epics/kits_feature_breakdown.md:70-82).  
  - Evidence: docs/features/kit_detail_bom_management/plan.md:225-243.
- Behavior: Client-side filtering & related chips  
  - Scenarios: Filter by SKU substring and view memberships on load (`tests/e2e/kits/kits-detail.spec.ts`) (docs/features/kit_detail_bom_management/plan.md:337-342).  
  - Instrumentation: `waitForListLoading(page, 'kits.detail.contents', 'ready')`, `waitForListLoading(page, 'kits.list.memberships.<scope>', 'ready')` (docs/features/kit_detail_bom_management/plan.md:337-342).  
  - Backend hooks: Membership queries via `use-kit-memberships` (docs/features/kit_detail_bom_management/plan.md:75-77, 337-342).  
  - Gaps: Filter changes never drive a fresh `list_loading` transition, so Playwright waits would stall unless the plan introduces new instrumentation beyond what’s described (docs/features/kit_detail_bom_management/plan.md:247-249, 290-295).  
  - Evidence: docs/features/kit_detail_bom_management/plan.md:245-252, 337-343.

### 5) Adversarial Sweep (must find ≥3 credible issues)
**Major — Filter instrumentation never re-emits**  
**Evidence:** docs/features/kit_detail_bom_management/plan.md:247-249, 290-295; docs/contribute/testing/playwright_developer_guide.md:128-138 — Plan expects `waitForListLoading` to observe filter counts, but the hook only emits on load/fetch transitions.  
**Why it matters:** Playwright specs would hang waiting for a `list_loading` event that never fires on pure client filtering.  
**Fix suggestion:** Add an explicit filter-state instrumentation event (or drive `useListLoadingInstrumentation` with a synthetic filtering flag) and document the ready metadata.  
**Confidence:** High

**Major — Metadata edits leave availability math undefined**  
**Evidence:** docs/features/kit_detail_bom_management/plan.md:215-223, 278-279; docs/epics/kits_feature_breakdown.md:55-73 — Plan updates the detail cache metadata but never specifies how `total_required`, `available`, or `shortfall` refresh after `build_target` changes.  
**Why it matters:** Users could see stale computed columns, violating the epic’s promise of live availability math.  
**Fix suggestion:** Commit to either recomputing row aggregates locally or triggering a detail refetch before reporting success (and include that in derived state + tests).  
**Confidence:** High

**Major — Conflict flows lack deterministic coverage**  
**Evidence:** docs/features/kit_detail_bom_management/plan.md:235-243, 329-334; docs/epics/kits_feature_breakdown.md:70-82 — The plan discusses 409 handling but omits test scenarios for version conflicts or duplicate parts.  
**Why it matters:** Without coverage, conflict instrumentation/toasts may regress silently, undermining concurrency guarantees.  
**Fix suggestion:** Add Playwright scenarios that seed conflicting updates and assert `KitDetail:content.*` error events plus toast metadata.  
**Confidence:** High

### 6) Derived-Value & State Invariants
- Derived value: metadataEditable
  - Source dataset: KitDetail.status from `useKitDetail`
  - Write / cleanup triggered: Enables/disables metadata form submission/mutations
  - Guards: None beyond `status === 'active'`
  - Invariant: Archived kits never surface active controls while backend also rejects edits
  - Evidence: docs/features/kit_detail_bom_management/plan.md:256-259
- Derived value: filteredContents
  - Source dataset: KitDetail.contents filtered by search term
  - Write / cleanup triggered: Drives grid rows, empty state, and filter instrumentation metadata
  - Guards: Debounced input, must avoid mutating source array
  - Invariant: Filtering cannot desync base contents; empty state only when derived array length is zero
  - Evidence: docs/features/kit_detail_bom_management/plan.md:261-264
- Derived value: optimisticRowMap
  - Source dataset: Local record of pending row IDs / synthetic IDs during mutations
  - Write / cleanup triggered: Blocks duplicate submissions and clears upon mutation settlement
  - Guards: Must reset on success/error/unmount
  - Invariant: No row remains marked optimistic after mutation settles
  - Evidence: docs/features/kit_detail_bom_management/plan.md:271-274

### 7) Risks & Mitigations (top 3)
- Risk: Stale BOM aggregates after build-target edits leave computed columns incorrect.  
  Mitigation: Explicitly recompute rows or refetch detail before emitting success instrumentation.  
  Evidence: docs/features/kit_detail_bom_management/plan.md:215-223; docs/epics/kits_feature_breakdown.md:55-61.
- Risk: Filter instrumentation fails to unblock tests, causing flaky Playwright coverage.  
  Mitigation: Introduce a deterministic filter event or align tests with DOM assertions instead of `list_loading`.  
  Evidence: docs/features/kit_detail_bom_management/plan.md:247-249, 290-295; docs/contribute/testing/playwright_developer_guide.md:128-138.
- Risk: Conflict handling remains unvalidated, so optimistic locking regressions would ship unnoticed.  
  Mitigation: Add seeded conflict scenarios asserting toast + form error instrumentation.  
  Evidence: docs/features/kit_detail_bom_management/plan.md:235-243, 329-334; docs/epics/kits_feature_breakdown.md:70-82.

### 8) Confidence
Confidence: Medium — Plan structure is solid, but critical instrumentation and cache behaviors are unspecified, leaving meaningful risk until the conditions above are addressed.
