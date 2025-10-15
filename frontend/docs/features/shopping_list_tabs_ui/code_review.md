### 1) Summary & Decision
New segmented tab primitive matches the planned controlled API and instrumentation updates (`docs/features/shopping_list_tabs_ui/plan.md:18-36` — "Create … handle arrow keys … count badges"; `src/components/ui/segmented-tabs.tsx:41-215` — `export function SegmentedTabs({ items, value, onValueChange, ... })`). Tests cover counts and keyboard flows (`tests/e2e/shopping-lists/shopping-lists.spec.ts:331-414` — `test('filters segmented tabs …')`). However, keyboard navigation no longer guarantees the focused tab stays in view once the list scrolls because the component prevents scroll-on-focus (`src/components/ui/segmented-tabs.tsx:141-149` — `node?.focus({ preventScroll: true });`). **Decision:** GO-WITH-CONDITIONS — fix the overflow keyboard regression.

### 2) Conformance to Plan (with evidence)
- **Segmented Tabs primitive delivered:** `docs/features/shopping_list_tabs_ui/plan.md:18-24` — "Create `segmented-tabs.tsx` … controlled `<SegmentedTabs>`" ⇔ `src/components/ui/segmented-tabs.tsx:41-215` — `return ( <div role="tablist" …>{items.map(…)</div> )`.
- **Overview summary updated with filtered copy:** `docs/features/shopping_list_tabs_ui/plan.md:27-30` — "update the copy to surface filtered totals" ⇔ `src/components/shopping-lists/overview-list.tsx:317-334` — `<div …><span>{summaryText}</span>…{filteredLists.length} filtered</div>`.
- **Metadata now exposes `visibleCount`:** `docs/features/shopping_list_tabs_ui/plan.md:30` — "include a `visibleCount` derived from the currently visible list array" ⇔ `src/components/shopping-lists/overview-list.tsx:101-111` — `visibleCount: visibleLists.length`.
- **Playwright coverage refreshed:** `docs/features/shopping_list_tabs_ui/plan.md:45-58` — "Extend page objects… assert badge counts, breadcrumb, keyboard" ⇔ `tests/e2e/shopping-lists/shopping-lists.spec.ts:331-414` — `test('filters segmented tabs …')` & `test('supports keyboard navigation …')`, plus `tests/support/page-objects/shopping-lists-page.ts:43-104` — `overviewTab()` / `selectOverviewTab`.
- **Missing Step 2.3 layout polish:** `docs/features/shopping_list_tabs_ui/plan.md:28` — "Add a subtle divider … `flex flex-col gap-3`" yet the overview still renders the legacy stack without the new container (`src/components/shopping-lists/overview-list.tsx:300-335` — standalone search div + `<SegmentedTabs className="mb-4" />`).

### 3) Correctness — Findings (ranked)
- **[C1] Major — Arrow-key navigation hides overflowed tabs**  
  **Evidence:** `src/components/ui/segmented-tabs.tsx:141-149` — `node?.focus({ preventScroll: true });`.  
  **Why it matters:** Plan Step 3.1 makes the tab list horizontally scrollable. With `preventScroll: true`, moving focus via ArrowRight/ArrowLeft keeps the newly focused tab off-screen once the list exceeds the viewport, stranding keyboard users.  
  **Fix suggestion:** Drop `preventScroll` or follow it with `node?.scrollIntoView({ block: 'nearest', inline: 'center' });` so focus shifts remain visible.  
  **Confidence:** High.

### 4) Over-Engineering & Refactoring Opportunities
- None jumped out; the measurement + focus logic aligns with the planned accessibility scope (`src/components/ui/segmented-tabs.tsx:41-215` — combination of refs, observers, and keyboard handlers).

### 5) Style & Consistency
- The divider + stacked mobile layout requested in Step 2.3 is still absent (`docs/features/shopping_list_tabs_ui/plan.md:28` — "Add a subtle divider … `flex flex-col gap-3`"; `src/components/shopping-lists/overview-list.tsx:300-335` — retains the prior search + summary layout), leaving the overview header slightly off from contributor guidelines.

### 6) Tests & Deterministic Coverage (new/changed behavior only)
- **Segmented tab counts + summary:** `tests/e2e/shopping-lists/shopping-lists.spec.ts:331-395` — `test('filters segmented tabs by search without losing totals', …)` waits on telemetry, asserts badge totals, and checks the filtered summary copy.
- **Breadcrumb + persistence:** `tests/e2e/shopping-lists/shopping-lists.spec.ts:300-329` — earlier scenario keeps Completed active after returning, matching Plan Scenario 2.
- **Keyboard flow:** `tests/e2e/shopping-lists/shopping-lists.spec.ts:398-420` — `test('supports keyboard navigation on segmented tabs', …)` hits Arrow/Space/Enter and inspects telemetry + summary.
- **Gap:** No coverage for an overflowed tablist, so issue [C1] slipped through; add a Playwright case with ≥4 tabs or a narrow viewport to assert the focused tab becomes visible.

### 7) Adversarial Sweep
1. Simulated horizontal overflow with scrollable tabs and found the focused tab remains off-screen because of `preventScroll` — issue [C1] (`src/components/ui/segmented-tabs.tsx:141-149` — `node?.focus({ preventScroll: true });`).
2. Probed telemetry churn; the `filterUiPendingRef` gate still wraps `beginUiState`/`endUiState` correctly, preventing duplicate events (`src/components/shopping-lists/overview-list.tsx:115-144` — `if (filterUiPendingRef.current) { … endUiState(…) }`).
3. Checked count consistency under filtering; tests assert both summary text and badge totals align with `filtersMetadata` (`tests/e2e/shopping-lists/shopping-lists.spec.ts:331-395` — `expect(shoppingLists.expectOverviewTabCounts(…))`, `src/components/shopping-lists/overview-list.tsx:101-108` — `visibleCount: visibleLists.length`).

### 8) Invariants Checklist (table)
| Invariant | Where enforced | How it could fail | Current protection | Evidence (file:lines) |
|---|---|---|---|---|
| Tab badges show unfiltered totals | Counts derive from the full dataset | Using filtered arrays would under-report totals | `lists.filter((list) => list.status !== 'done')` / `'done'` | `src/components/shopping-lists/overview-list.tsx:90-100` — `const totalActiveCount = useMemo(() => lists.filter(…).length, …)` |
| `visibleCount` matches rendered cards | Metadata + render both use `visibleLists` | Divergent sources would desync UI and telemetry | Same `visibleLists` memo feeds both | `src/components/shopping-lists/overview-list.tsx:101-108` — `visibleCount: visibleLists.length`; `src/components/shopping-lists/overview-list.tsx:358-366` — `{visibleLists.map(…)}` |
| Filter UI-state events always close | Effect pairs `beginUiState` / `endUiState` | Early return during loading could leave pending state | `filterUiPendingRef` toggled before `endUiState` | `src/components/shopping-lists/overview-list.tsx:115-144` — `if (filterUiPendingRef.current) { filterUiPendingRef.current = false; endUiState(…) }` |

### 9) Questions / Needs-Info
- Q1 — Are we intentionally deferring the divider + stacked mobile layout from Step 2.3 (`docs/features/shopping_list_tabs_ui/plan.md:28` — "Add a subtle divider … `flex flex-col gap-3`)? The current markup still mirrors the legacy layout (`src/components/shopping-lists/overview-list.tsx:300-335` — search container + `<SegmentedTabs className="mb-4" />`).

### 10) Risks & Mitigations (top 3)
- R1 — Keyboard users can’t reach overflowed tabs because focus stays off-screen (`src/components/ui/segmented-tabs.tsx:141-149` — `node?.focus({ preventScroll: true });`). → Remove `preventScroll` or scroll the focused tab into view.
- R2 — Missing divider/stacked layout leaves the overview header inconsistent with contributor guidance (`docs/features/shopping_list_tabs_ui/plan.md:28`; `src/components/shopping-lists/overview-list.tsx:300-335`). → Implement the documented container adjustments.
- R3 — Without an overflow-focused test, regressions in scrollable navigation will recur (`tests/e2e/shopping-lists/shopping-lists.spec.ts:331-420` — current scenarios cover only two tabs). → Add a Playwright case that validates scrolling behavior.

### 11) Confidence
Medium — The static analysis surfaced the overflow issue, but I did not run the UI to observe the scroll behavior directly.
