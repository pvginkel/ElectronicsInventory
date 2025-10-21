### 1) Summary & Decision
**Readiness**
The routing, hook, and UI slices are mapped, but the plan diverges from the instrumentation contract and tooltip behavior and discards linkage arrays future slices require—see `"Labels / fields: { kitId, totalRequired, totalAvailable, shortfallCount }"` (docs/features/kit_detail_workspace/plan.md:236-239) versus the spec’s expected fields (docs/epics/kits_feature_breakdown.md:67-69) and `"Guards: Limit tooltip entries to top N with overflow indicator"` (docs/features/kit_detail_workspace/plan.md:187-188) despite the requirement to list each reserving kit. The proposed `KitDetail` shape also omits `shopping_list_links`/`pick_lists` that the backend already returns (docs/features/kit_detail_workspace/plan.md:96-104; docs/epics/kits_feature_breakdown.md:63-66), so adjustments are needed before implementation.

**Decision**
`GO-WITH-CONDITIONS` — Align instrumentation metadata, keep the reservation tooltip exhaustive, and preserve linkage arrays in the domain model.

### 2) Conformance & Fit (with evidence)
**Conformance to refs**
- `docs/epics/kits_feature_breakdown.md:67-69` — Fail — docs/features/kit_detail_workspace/plan.md:236-239 — `"Labels / fields: { kitId, totalRequired, totalAvailable, shortfallCount } on success."`
- `docs/epics/kits_feature_breakdown.md:55-59` — Fail — docs/features/kit_detail_workspace/plan.md:187-188 — `"Guards: Limit tooltip entries to top N with overflow indicator to maintain readability."`
- `docs/epics/kits_feature_breakdown.md:63-66` — Fail — docs/features/kit_detail_workspace/plan.md:96-104 — `"Shape: { id: number; ...; pickListBadgeCount: number; archivedAt: string | null; updatedAt: string; contents: KitContentRow[] }"` (missing linkage arrays the spec says are returned).
- `docs/contribute/testing/playwright_developer_guide.md:85` — Pass — docs/features/kit_detail_workspace/plan.md:280-282 — `"Given instrumentation is active... Then waitForListLoading receives 'kits.detail' and 'kits.detail.contents' 'ready' events..."` (deterministic wait strategy lines up with the guide).

**Fit with codebase**
- `DetailScreenLayout` reuse — docs/features/kit_detail_workspace/plan.md:24-27 — aligns with existing detail routes.
- `useKitDetail` hook plan — docs/features/kit_detail_workspace/plan.md:59-61 — follows the custom-hook wrapper pattern, but must expose linkage data for downstream chips.

### 3) Open Questions & Ambiguities
- Question: Will the instrumentation metadata keys be updated to the documented `{ kitId, status, contentCount }` / `{ kitId, available, shortfallCount, total }` payloads?
  - Why it matters: `waitForListLoading` helpers expect the documented keys; mismatch breaks deterministic waits.
  - Needed answer: Confirm the plan will emit `available` and `total` rather than `totalAvailable` / `totalRequired`.
- Question: How are `shopping_list_links` and `pick_lists` from `GET /kits/{kit_id}` preserved so linkage chips can land without refactoring the hook?
  - Why it matters: Later slices (docs/epics/kits_feature_breakdown.md:137-158) depend on those arrays.
  - Needed answer: Spell out the domain shape that keeps both arrays (even if unused today).
- Question: What coverage will guarantee the empty BOM state remains deterministic?
  - Why it matters: Empty kits are called out in the failure handling section (docs/features/kit_detail_workspace/plan.md:214-217) but are absent from the scenarios (docs/features/kit_detail_workspace/plan.md:276-280).
  - Needed answer: Add or justify a scenario that seeds an empty kit and asserts the empty-state instrumentation.

### 4) Deterministic Playwright Coverage (new/changed behavior only)
- Behavior: Kit detail view (populated)
  - Scenarios:
    - Given an active kit with contents exists, When a user clicks its card, Then the header and disabled Edit button render as expected (`tests/e2e/kits/kit-detail.spec.ts`).
    - Given the same kit, When the table loads, Then each row shows the required aggregates with shortfall highlighting.
    - Given a row with reservations, When the indicator is hovered, Then the tooltip lists each reserving kit in backend order.
    - Given instrumentation is active, When the route hydrates, Then `waitForListLoading` receives `kits.detail` and `kits.detail.contents` ready events.
  - Instrumentation: `waitForListLoading`, `kits.detail`, `kits.detail.contents`, `kits.detail.*` test IDs.
  - Backend hooks: Kit factory helpers that seed contents, inventory, and competing reservations.
  - Gaps: Needs explicit scenario for empty/error states.
  - Evidence: docs/features/kit_detail_workspace/plan.md:276-282.
- Behavior: Kit detail empty BOM
  - Scenarios: Missing—plan only notes the empty-state requirement.
  - Instrumentation: Should assert `kits.detail` ready with `contentCount: 0`.
  - Backend hooks: Factory helper that creates a kit without contents.
  - Gaps: Major gap until a scenario is defined.
  - Evidence: docs/features/kit_detail_workspace/plan.md:214-217.

### 5) **Adversarial Sweep (must find ≥3 credible issues or declare why none exist)**
**Major — Instrumentation metadata diverges from spec**
**Evidence:** docs/features/kit_detail_workspace/plan.md:236-239; docs/epics/kits_feature_breakdown.md:67-69 — `"Labels / fields: { kitId, totalRequired, totalAvailable, shortfallCount } on success."`
**Why it matters:** `waitForListLoading` consumers and existing helpers look for `available`/`total`; mismatched keys stall tests and instrumentation dashboards.
**Fix suggestion:** Emit `{ kitId, available, shortfallCount, total }` for `kits.detail.contents` and keep `contentCount` on the main scope.
**Confidence:** High

**Major — Reservation tooltip truncates backend entries**
**Evidence:** docs/features/kit_detail_workspace/plan.md:187-188; docs/features/kit_detail_workspace/plan.md:279-280 — `"Limit tooltip entries to top N..."` contradicts the scenario that expects a full list.
**Why it matters:** Truncation hides reservations the backend sends, causing false negatives in planning and violating the stated acceptance test.
**Fix suggestion:** Remove the top-N clamp; render all reservations (possibly with scrolling) while keeping backend order.
**Confidence:** High

**Major — KitDetail domain model drops linkage arrays**
**Evidence:** docs/features/kit_detail_workspace/plan.md:96-104; docs/epics/kits_feature_breakdown.md:63-66 — `"GET /kits/<int:kit_id> returns ... 'shopping_list_links', and 'pick_lists'."`
**Why it matters:** Discarding these fields forces rework when linkage chips ship and prevents the hook from being a single source of truth.
**Fix suggestion:** Extend `KitDetail` to expose `shoppingListLinks` and `pickLists` (mapped to camelCase) even if unused in the read-only slice.
**Confidence:** Medium

**Major — Empty-state flow lacks deterministic coverage**
**Evidence:** docs/features/kit_detail_workspace/plan.md:214-217; docs/features/kit_detail_workspace/plan.md:276-282 — empty state described but not covered in scenarios.
**Why it matters:** Without a spec asserting the empty table behavior and instrumentation, regressions or schema changes could slip through unnoticed.
**Fix suggestion:** Add a Playwright scenario that seeds an empty kit, waits for `contentCount: 0`, and verifies the empty-state message.
**Confidence:** Medium

### 6) **Derived-Value & State Invariants (table)**
- Derived value: `contentAggregates`
  - Source dataset: `detail.contents` reductions.
  - Write / cleanup triggered: Feeds `kits.detail.contents` metadata and any summary badges.
  - Guards: Clamp numeric sums to `>= 0`.
  - Invariant: Totals must match the table values.
  - Evidence: docs/features/kit_detail_workspace/plan.md:170-175.
- Derived value: `rowsWithShortfall`
  - Source dataset: Filtered `detail.contents` where `shortfall > 0`.
  - Write / cleanup triggered: Drives shortfall styling and instrumentation counts.
  - Guards: Skip during loading; avoid null dereferences.
  - Invariant: Highlighting mirrors computed shortfall.
  - Evidence: docs/features/kit_detail_workspace/plan.md:177-182.
- Derived value: `kitBreadcrumbSearch`
  - Source dataset: Router search state from the overview link.
  - Write / cleanup triggered: Preserves search context on back navigation.
  - Guards: Default to active tab when missing.
  - Invariant: Returning to `/kits` restores the prior filter.
  - Evidence: docs/features/kit_detail_workspace/plan.md:191-196.

### 7) Risks & Mitigations (top 3)
- Risk: Deterministic seeding for kit contents is easy to get wrong.  
  - Mitigation: Follow the factory extension outlined in `"Extend kit factory to create parts with deterministic stock levels..."` (docs/features/kit_detail_workspace/plan.md:308-311).
- Risk: Large kits could cause render lag from repeated aggregate computations.  
  - Mitigation: Memoize mapped rows as planned in `"Hotspots: Avoid re-computing aggregates on every render by memoizing 'contents'."` (docs/features/kit_detail_workspace/plan.md:129-130).
- Risk: Instrumentation metadata drifting from UI values.  
  - Mitigation: Centralize aggregates in the hook per `"Centralize aggregate computation in hook and reuse for both UI and instrumentation."` (docs/features/kit_detail_workspace/plan.md:316-318).

### 8) Confidence
Confidence: Medium — Major alignment issues were found, but the remainder matches documented patterns.
